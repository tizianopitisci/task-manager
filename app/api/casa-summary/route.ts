import { DateTime } from "luxon";
import { NextResponse } from "next/server";
import { BrevoClient } from "@getbrevo/brevo";
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

// Costruisce il percorso completo padre → figlio per un task
function buildPath(taskId: string, allTasks: Task[]): string {
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
        ? `✅ <strong>${title}</strong>`
        : `<span style="color:#888">${title}</span>`
    )
    .join(' <span style="color:#bbb">→</span> ');
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("x-cron-secret") !== cronSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const brevo = new BrevoClient({ apiKey: process.env.BREVO_API_KEY! });

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

  const listHtml = completedThisWeek
    .map((t) => `<li style="margin-bottom:8px;">${buildPath(t.id, allTasks)}</li>`)
    .join("");

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.6;">
      <p>Ciao Chiara,</p>
      <p>ecco cosa ha fatto questa settimana Tiziano per la casa.</p>

      <ul style="padding-left:20px;margin:20px 0;">
        ${listHtml}
      </ul>

      <p>Dimostra la tua gratitudine a Tiziano scrivendogli un messaggio su WhatsApp 💬</p>

      <div style="text-align:center;margin:32px 0;">
        <a href="https://wa.me/${process.env.TIZIANO_WHATSAPP}"
           style="display:inline-block;background-color:#25D366;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:24px;font-weight:600;font-size:15px;">
          💬 Scrivi a Tiziano
        </a>
      </div>

      <p style="margin-top:32px;color:#999;font-size:12px;">
        Settimana del ${nowRome.startOf("week").toFormat("d MMM")} – ${nowRome.endOf("week").toFormat("d MMM yyyy")}
        &nbsp;·&nbsp; ${completedThisWeek.length} task completat${completedThisWeek.length === 1 ? "o" : "i"}
      </p>
    </div>
  `;

  try {
    await brevo.transactionalEmails.sendTransacEmail({
      sender: { name: "Task Manager", email: "tizianopitisci@gmail.com" },
      to: [
        { email: "tizianopitisci@gmail.com" },
        { email: "chiaradominelli@gmail.com" },
      ],
      subject: `🏠 Tiziano ha completato ${completedThisWeek.length} task per la casa questa settimana`,
      htmlContent: html,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent: true, completedCount: completedThisWeek.length });
}
