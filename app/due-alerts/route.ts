import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

function startEndOfTodayUtc() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));
  return { start, end };
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const resendKey = process.env.RESEND_API_KEY!;

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const resend = new Resend(resendKey);

  const { start, end } = startEndOfTodayUtc();

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id,title,due_at")
    .eq("completed", false)
    .gte("due_at", start.toISOString())
    .lte("due_at", end.toISOString())
    .order("due_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!tasks || tasks.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "Nessuna scadenza oggi" });
  }

  const list = tasks
    .map((t) => `• ${t.title}${t.due_at ? ` (${new Date(t.due_at).toLocaleString()})` : ""}`)
    .join("<br/>");

  const { error: mailErr } = await resend.emails.send({
    from: "Task Manager <onboarding@resend.dev>",
    to: ["tizianopitisci@gmail.com"],
    subject: `Scadenze di oggi: ${tasks.length}`,
    html: `<p>Task in scadenza oggi:</p><p>${list}</p>`,
  });

  if (mailErr) {
    return NextResponse.json({ ok: false, error: mailErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent: tasks.length });
}
