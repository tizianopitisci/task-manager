import { DateTime } from "luxon";
import { NextResponse } from "next/server";
import { BrevoClient } from "@getbrevo/brevo";
import { createClient } from "@supabase/supabase-js";

function startEndOfTodayRome() {
  const startRome = DateTime.now().setZone("Europe/Rome").startOf("day");
  const endRome = DateTime.now().setZone("Europe/Rome").endOf("day");
  return { start: startRome.toUTC().toISO(), end: endRome.toUTC().toISO(), today: startRome.toISODate() };
}


export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const brevo = new BrevoClient({ apiKey: process.env.BREVO_API_KEY! });

  const { start, end, today } = startEndOfTodayRome();


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

  const formatItem = (t: any) =>
    `• ${t.title}${t.due_at ? ` (${new Date(t.due_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })})` : ""}`;

  const tizList = toNotify.filter((t: any) => t.assignee !== "chiara");
  const chiaraList = toNotify.filter((t: any) => t.assignee === "chiara");

  const errors: string[] = [];

  if (tizList.length > 0) {
    try {
      await brevo.transactionalEmails.sendTransacEmail({
        sender: { name: "Task Manager", email: "tizianopitisci@gmail.com" },
        to: [{ email: "tizianopitisci@gmail.com" }],
        subject: `Scadenze di oggi: ${tizList.length}`,
        htmlContent: `<p>Task in scadenza oggi:</p><p>${tizList.map(formatItem).join("<br/>")}</p>`,
      });
    } catch (err: any) { errors.push(err?.message ?? "Errore email Tiziano"); }
  }

  if (chiaraList.length > 0) {
    try {
      await brevo.transactionalEmails.sendTransacEmail({
        sender: { name: "Task Manager", email: "tizianopitisci@gmail.com" },
        to: [{ email: "chiaradominelli@gmail.com" }],
        subject: `I tuoi task di oggi: ${chiaraList.length}`,
        htmlContent: `<p>Ciao Chiara, hai questi task in scadenza oggi:</p><p>${chiaraList.map(formatItem).join("<br/>")}</p>`,
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
