import { DateTime } from "luxon";
import { NextResponse } from "next/server";
import { BrevoClient } from "@getbrevo/brevo";
import { createClient } from "@supabase/supabase-js";

function buildPath(
  taskId: string,
  allTasks: { id: string; title: string; parent_id: string | null }[]
): string {
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  const path: string[] = [];
  let cur = byId.get(taskId);
  const seen = new Set<string>();
  while (cur) {
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    path.unshift(cur.title);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  // Ultime voce in grassetto, antenati in grigio
  return path
    .map((title, i) =>
      i === path.length - 1
        ? `<strong>${title}</strong>`
        : `<span style="color:#888">${title}</span>`
    )
    .join(' <span style="color:#bbb">→</span> ');
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const brevo = new BrevoClient({ apiKey: process.env.BREVO_API_KEY! });

  const nowRome = DateTime.now().setZone("Europe/Rome");
  const startOfToday = nowRome.startOf("day").toUTC().toISO()!;
  const endOfWeek = nowRome.endOf("week").toUTC().toISO()!;

  // Carica tutti i task per costruire la gerarchia
  const { data: allTasksRaw, error: errAll } = await supabase
    .from("tasks")
    .select("id,title,parent_id");
  if (errAll) {
    return NextResponse.json({ ok: false, error: errAll.message }, { status: 500 });
  }
  const allTasks = (allTasksRaw ?? []) as { id: string; title: string; parent_id: string | null }[];

  // Task in scadenza questa settimana (da oggi a domenica)
  const { data: dueThisWeek, error: err1 } = await supabase
    .from("tasks")
    .select("id,title,due_at,parent_id,assignee")
    .eq("completed", false)
    .gte("due_at", startOfToday)
    .lte("due_at", endOfWeek)
    .order("due_at", { ascending: true });

  if (err1) {
    return NextResponse.json({ ok: false, error: err1.message }, { status: 500 });
  }

  // Task scaduti e non completati
  const { data: overdue, error: err2 } = await supabase
    .from("tasks")
    .select("id,title,due_at,parent_id,assignee")
    .eq("completed", false)
    .lt("due_at", startOfToday)
    .order("due_at", { ascending: true });

  if (err2) {
    return NextResponse.json({ ok: false, error: err2.message }, { status: 500 });
  }

  const allDue = dueThisWeek ?? [];
  const allOverdue = overdue ?? [];

  // Dividi per destinatario: Tiziano = non assegnato o assegnato a tiziano, Chiara = assignee=chiara
  const isChiara = (t: { assignee?: string | null }) => t.assignee === "chiara";
  const isTiziano = (t: { assignee?: string | null }) => !isChiara(t);

  const dueTiz = allDue.filter(isTiziano);
  const overdueTiz = allOverdue.filter(isTiziano);
  const dueChiara = allDue.filter(isChiara);
  const overdueChiara = allOverdue.filter(isChiara);

  if (allDue.length === 0 && allOverdue.length === 0) {
    return NextResponse.json({ ok: true, sent: false, message: "Nessun task da segnalare" });
  }

  const formatDate = (iso: string) =>
    DateTime.fromISO(iso).setZone("Europe/Rome").setLocale("it").toFormat("EEE d MMM");

  const buildSections = (
    dueList: typeof allDue,
    overdueList: typeof allOverdue
  ) => {
    const weekLabel = `${nowRome.startOf("week").setLocale("it").toFormat("d MMM")} – ${nowRome.endOf("week").setLocale("it").toFormat("d MMM yyyy")}`;
    const dueSection = dueList.length > 0
      ? `<h2 style="margin:24px 0 8px;font-size:16px;">📌 In scadenza questa settimana</h2>
         <ul style="margin:0;padding-left:20px;">
           ${dueList.map((t) => `<li style="margin-bottom:8px;">${buildPath(t.id, allTasks)} — ${formatDate(t.due_at)}</li>`).join("")}
         </ul>` : "";
    const overdueSection = overdueList.length > 0
      ? `<h2 style="margin:24px 0 8px;font-size:16px;">⚠️ Scaduti e non completati</h2>
         <ul style="margin:0;padding-left:20px;">
           ${overdueList.map((t) => `<li style="margin-bottom:8px;">${buildPath(t.id, allTasks)} — scaduto il ${formatDate(t.due_at)}</li>`).join("")}
         </ul>` : "";
    return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111;">
      <h1 style="font-size:20px;margin-bottom:4px;">📅 Riepilogo settimanale task</h1>
      <p style="color:#666;margin-top:0;">Settimana del ${weekLabel}</p>
      ${dueSection}${overdueSection}
    </div>`;
  };

  const errors: string[] = [];

  // Email a Tiziano
  if (dueTiz.length > 0 || overdueTiz.length > 0) {
    try {
      await brevo.transactionalEmails.sendTransacEmail({
        sender: { name: "Task Manager", email: "tizianopitisci@gmail.com" },
        to: [{ email: "tizianopitisci@gmail.com" }],
        subject: `📅 Riepilogo settimanale — ${dueTiz.length} in scadenza, ${overdueTiz.length} scaduti`,
        htmlContent: buildSections(dueTiz, overdueTiz),
      });
    } catch (err: any) {
      errors.push(err?.message ?? "Errore email Tiziano");
    }
  }

  // Email a Chiara
  if (dueChiara.length > 0 || overdueChiara.length > 0) {
    try {
      await brevo.transactionalEmails.sendTransacEmail({
        sender: { name: "Task Manager", email: "tizianopitisci@gmail.com" },
        to: [{ email: "chiaradominelli@gmail.com" }],
        subject: `📅 I tuoi task della settimana — ${dueChiara.length} in scadenza, ${overdueChiara.length} scaduti`,
        htmlContent: buildSections(dueChiara, overdueChiara),
      });
    } catch (err: any) {
      errors.push(err?.message ?? "Errore email Chiara");
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    dueThisWeek: allDue.length,
    overdue: allOverdue.length,
  });
}
