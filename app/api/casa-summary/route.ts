import { DateTime } from "luxon";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

type Task = {
  id: string;
  title: string;
  parent_id: string | null;
  completed: boolean;
  completed_at: string | null;
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

// Costruisce una lista HTML annidata mostrando solo i task completati questa settimana,
// rispettando la gerarchia originale
function buildHtmlList(allTasks: Task[], completedIds: Set<string>, parentId: string): string {
  const children = allTasks.filter(
    (t) => t.parent_id === parentId && completedIds.has(t.id)
  );
  if (children.length === 0) return "";

  return children
    .map((t) => {
      const nested = buildHtmlList(allTasks, completedIds, t.id);
      return `<li style="margin-bottom:6px;">
        ✅ <strong>${t.title}</strong>
        ${nested ? `<ul style="margin:6px 0 0 0;padding-left:20px;">${nested}</ul>` : ""}
      </li>`;
    })
    .join("");
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const resendKey = process.env.RESEND_API_KEY!;

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const resend = new Resend(resendKey);

  const nowRome = DateTime.now().setZone("Europe/Rome").setLocale("it");
  // Inizio settimana corrente (lunedì 00:00 ora italiana)
  const startOfWeek = nowRome.startOf("week").toUTC().toISO()!;

  // Carica tutti i task con completed_at
  const { data: rawTasks, error } = await supabase
    .from("tasks")
    .select("id,title,parent_id,completed,completed_at")
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

  // Tutti i discendenti di CASA completati QUESTA settimana
  const descendants = getDescendants(allTasks, casaNode.id);
  const completedThisWeek = descendants.filter(
    (t) => t.completed && t.completed_at && t.completed_at >= startOfWeek
  );

  if (completedThisWeek.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: false,
      message: "Nessun task completato questa settimana sotto CASA",
    });
  }

  const completedIds = new Set(completedThisWeek.map((t) => t.id));
  const listHtml = buildHtmlList(allTasks, completedIds, casaNode.id);

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.6;">
      <p>Ciao Chiara,</p>
      <p>ecco cosa ha fatto questa settimana Tiziano per la casa.</p>

      <ul style="padding-left:20px;margin:20px 0;">
        ${listHtml}
      </ul>

      <p>Dimostra la tua gratitudine a Tiziano con un &ldquo;grazie&rdquo;. 😊</p>

      <p style="margin-top:32px;color:#999;font-size:12px;">
        Settimana del ${nowRome.startOf("week").toFormat("d MMM")} – ${nowRome.endOf("week").toFormat("d MMM yyyy")}
        &nbsp;·&nbsp; ${completedThisWeek.length} task completat${completedThisWeek.length === 1 ? "o" : "i"}
      </p>
    </div>
  `;

  const { error: mailErr } = await resend.emails.send({
    from: "Task Manager <onboarding@resend.dev>",
    to: ["tizianopitisci@gmail.com", "chiaradominelli@gmail.com"],
    subject: `🏠 Tiziano ha completato ${completedThisWeek.length} task per la casa questa settimana`,
    html,
  });

  if (mailErr) {
    return NextResponse.json({ ok: false, error: mailErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent: true, completedCount: completedThisWeek.length });
}
