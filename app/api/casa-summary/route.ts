import { DateTime } from "luxon";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

type Task = {
  id: string;
  title: string;
  parent_id: string | null;
  completed: boolean;
};

// Restituisce tutti i discendenti di un nodo (ricorsivo)
function getDescendants(allTasks: Task[], parentId: string): Task[] {
  const children = allTasks.filter((t) => t.parent_id === parentId);
  const result: Task[] = [];
  for (const child of children) {
    result.push(child);
    result.push(...getDescendants(allTasks, child.id));
  }
  return result;
}

// Costruisce una lista HTML annidata mostrando solo i task completati,
// rispettando la gerarchia originale
function buildHtmlList(allTasks: Task[], completedIds: Set<string>, parentId: string): string {
  const children = allTasks.filter(
    (t) => t.parent_id === parentId && completedIds.has(t.id)
  );
  if (children.length === 0) return "";

  const items = children
    .map((t) => {
      const nested = buildHtmlList(allTasks, completedIds, t.id);
      return `<li style="margin-bottom:6px;">
        ✅ <strong>${t.title}</strong>
        ${nested ? `<ul style="margin:6px 0 0 0;padding-left:20px;">${nested}</ul>` : ""}
      </li>`;
    })
    .join("");

  return items;
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const resendKey = process.env.RESEND_API_KEY!;

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const resend = new Resend(resendKey);

  // Carica tutti i task
  const { data: rawTasks, error } = await supabase
    .from("tasks")
    .select("id,title,parent_id,completed")
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const allTasks = (rawTasks ?? []) as Task[];

  // Trova il nodo radice "CASA"
  const casaNode = allTasks.find((t) => !t.parent_id && t.title === "CASA");

  if (!casaNode) {
    return NextResponse.json({ ok: true, sent: false, message: 'Nodo "CASA" non trovato' });
  }

  // Tutti i discendenti di CASA
  const descendants = getDescendants(allTasks, casaNode.id);

  // Filtra solo i completati
  const completed = descendants.filter((t) => t.completed);

  if (completed.length === 0) {
    return NextResponse.json({ ok: true, sent: false, message: "Nessun task completato sotto CASA" });
  }

  const completedIds = new Set(completed.map((t) => t.id));

  const nowRome = DateTime.now().setZone("Europe/Rome").setLocale("it");
  const weekStart = nowRome.startOf("week").toFormat("d MMM");
  const weekEnd = nowRome.endOf("week").toFormat("d MMM yyyy");

  const listHtml = buildHtmlList(allTasks, completedIds, casaNode.id);

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111;">
      <h1 style="font-size:20px;margin-bottom:4px;">🏠 Task CASA completati</h1>
      <p style="color:#666;margin-top:0;">Settimana del ${weekStart} – ${weekEnd}</p>
      <ul style="padding-left:20px;line-height:1.6;">
        ${listHtml}
      </ul>
      <p style="margin-top:24px;color:#999;font-size:12px;">
        Totale: ${completed.length} task completat${completed.length === 1 ? "o" : "i"}
      </p>
    </div>
  `;

  const { error: mailErr } = await resend.emails.send({
    from: "Task Manager <onboarding@resend.dev>",
    to: ["tizianopitisci@gmail.com", "chiaradominelli@gmail.com"],
    subject: `🏠 Task CASA completati — ${completed.length} task`,
    html,
  });

  if (mailErr) {
    return NextResponse.json({ ok: false, error: mailErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent: true, completedCount: completed.length });
}
