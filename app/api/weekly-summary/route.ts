import { DateTime } from "luxon";
import { NextResponse } from "next/server";
import { BrevoClient } from "@getbrevo/brevo";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const brevo = new BrevoClient({ apiKey: process.env.BREVO_API_KEY! });

  const nowRome = DateTime.now().setZone("Europe/Rome");
  const startOfToday = nowRome.startOf("day").toUTC().toISO()!;
  const endOfWeek = nowRome.endOf("week").toUTC().toISO()!;

  // Task in scadenza questa settimana (da oggi a domenica)
  const { data: dueThisWeek, error: err1 } = await supabase
    .from("tasks")
    .select("id,title,due_at")
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
    .select("id,title,due_at")
    .eq("completed", false)
    .lt("due_at", startOfToday)
    .order("due_at", { ascending: true });

  if (err2) {
    return NextResponse.json({ ok: false, error: err2.message }, { status: 500 });
  }

  const dueList = dueThisWeek ?? [];
  const overdueList = overdue ?? [];

  if (dueList.length === 0 && overdueList.length === 0) {
    return NextResponse.json({ ok: true, sent: false, message: "Nessun task da segnalare" });
  }

  const formatDate = (iso: string) =>
    DateTime.fromISO(iso).setZone("Europe/Rome").setLocale("it").toFormat("EEE d MMM");

  const dueSection =
    dueList.length > 0
      ? `<h2 style="margin:24px 0 8px;font-size:16px;">📌 In scadenza questa settimana</h2>
         <ul style="margin:0;padding-left:20px;">
           ${dueList.map((t) => `<li style="margin-bottom:6px;"><strong>${t.title}</strong> — ${formatDate(t.due_at)}</li>`).join("")}
         </ul>`
      : "";

  const overdueSection =
    overdueList.length > 0
      ? `<h2 style="margin:24px 0 8px;font-size:16px;">⚠️ Scaduti e non completati</h2>
         <ul style="margin:0;padding-left:20px;">
           ${overdueList.map((t) => `<li style="margin-bottom:6px;"><strong>${t.title}</strong> — scaduto il ${formatDate(t.due_at)}</li>`).join("")}
         </ul>`
      : "";

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111;">
      <h1 style="font-size:20px;margin-bottom:4px;">📅 Riepilogo settimanale task</h1>
      <p style="color:#666;margin-top:0;">Settimana del ${nowRome.startOf("week").setLocale("it").toFormat("d MMM")} – ${nowRome.endOf("week").setLocale("it").toFormat("d MMM yyyy")}</p>
      ${dueSection}
      ${overdueSection}
    </div>
  `;

  try {
    await brevo.transactionalEmails.sendTransacEmail({
      sender: { name: "Task Manager", email: "tizianopitisci@gmail.com" },
      to: [{ email: "tizianopitisci@gmail.com" }],
      subject: `📅 Riepilogo settimanale — ${dueList.length} in scadenza, ${overdueList.length} scaduti`,
      htmlContent: html,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    sent: true,
    dueThisWeek: dueList.length,
    overdue: overdueList.length,
  });
}
