import { DateTime } from "luxon";
import { NextResponse } from "next/server";
import { BrevoClient } from "@getbrevo/brevo";
import { createClient } from "@supabase/supabase-js";

function startEndOfTodayRome() {
  const startRome = DateTime.now().setZone("Europe/Rome").startOf("day");
  const endRome = DateTime.now().setZone("Europe/Rome").endOf("day");
  return { start: startRome.toUTC().toISO(), end: endRome.toUTC().toISO(), today: startRome.toISODate() };
}

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

  const { start, end, today } = startEndOfTodayRome();

  // Carica tutti i task per costruire la gerarchia
  const { data: allTasksRaw, error: errAll } = await supabase
    .from("tasks")
    .select("id,title,parent_id");
  if (errAll) {
    return NextResponse.json({ ok: false, error: errAll.message }, { status: 500 });
  }
  const allTasks = (allTasksRaw ?? []) as { id: string; title: string; parent_id: string | null }[];

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id,title,due_at,alert_sent_on,assignee")
    .eq("completed", false)
    .gte("due_at", start)
    .lte("due_at", end)
    .order("due_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const toNotify = (tasks ?? []).filter((t: any) => t.alert_sent_on !== today);

  if (toNotify.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "Nessuna scadenza oggi (o già notificata)" });
  }

  const formatTime = (iso: string) =>
    DateTime.fromISO(iso).setZone("Europe/Rome").toFormat("HH:mm");

  const buildHtml = (list: any[], intro: string) => {
    const items = list
      .map((t) => `<li style="margin-bottom:8px;">${buildPath(t.id, allTasks)} — ${formatTime(t.due_at)}</li>`)
      .join("");
    return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111;">
      <h1 style="font-size:20px;margin-bottom:4px;">⏰ Scadenze di oggi</h1>
      <p style="color:#666;margin-top:0;">${intro}</p>
      <ul style="margin:0;padding-left:20px;">${items}</ul>
    </div>`;
  };

  const tizList = toNotify.filter((t: any) => t.assignee !== "chiara");
  const chiaraList = toNotify.filter((t: any) => t.assignee === "chiara");

  const errors: string[] = [];

  if (tizList.length > 0) {
    try {
      await brevo.transactionalEmails.sendTransacEmail({
        sender: { name: "Task Manager", email: "tizianopitisci@gmail.com" },
        to: [{ email: "tizianopitisci@gmail.com" }],
        subject: `⏰ Scadenze di oggi: ${tizList.length}`,
        htmlContent: buildHtml(tizList, `Hai ${tizList.length} task in scadenza oggi.`),
      });
    } catch (err: any) { errors.push(err?.message ?? "Errore email Tiziano"); }
  }

  if (chiaraList.length > 0) {
    try {
      await brevo.transactionalEmails.sendTransacEmail({
        sender: { name: "Task Manager", email: "tizianopitisci@gmail.com" },
        to: [{ email: "chiaradominelli@gmail.com" }],
        subject: `⏰ I tuoi task di oggi: ${chiaraList.length}`,
        htmlContent: buildHtml(chiaraList, `Ciao Chiara, hai ${chiaraList.length} task in scadenza oggi.`),
      });
    } catch (err: any) { errors.push(err?.message ?? "Errore email Chiara"); }
  }

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 500 });
  }

  await supabase
    .from("tasks")
    .update({ alert_sent_on: today })
    .in("id", toNotify.map((t: any) => t.id));

  return NextResponse.json({ ok: true, sent: toNotify.length });

}
