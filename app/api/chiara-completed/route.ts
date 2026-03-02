import { DateTime } from "luxon";
import { NextResponse } from "next/server";
import { BrevoClient } from "@getbrevo/brevo";
import { createClient } from "@supabase/supabase-js";

type Task = {
  id: string;
  title: string;
  parent_id: string | null;
  assignee: string | null;
  completed_at: string | null;
};

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

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const brevo = new BrevoClient({ apiKey: process.env.BREVO_API_KEY! });

  const nowRome = DateTime.now().setZone("Europe/Rome").setLocale("it");
  const sevenDaysAgo = nowRome.minus({ days: 7 }).toUTC().toISO()!;

  // Carica tutti i task per costruire la gerarchia
  const { data: allTasksRaw, error: errAll } = await supabase
    .from("tasks")
    .select("id,title,parent_id,assignee,completed_at");

  if (errAll) {
    return NextResponse.json({ ok: false, error: errAll.message }, { status: 500 });
  }

  const allTasks = (allTasksRaw ?? []) as Task[];

  // Task assegnati a Chiara e completati negli ultimi 7 giorni
  const completedByChiara = allTasks.filter(
    (t) =>
      t.assignee === "chiara" &&
      t.completed_at !== null &&
      t.completed_at >= sevenDaysAgo
  );

  if (completedByChiara.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: false,
      message: "Nessun task completato da Chiara negli ultimi 7 giorni",
    });
  }

  const listHtml = completedByChiara
    .map((t) => `<li style="margin-bottom:8px;">${buildPath(t.id, allTasks)}</li>`)
    .join("");

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111;line-height:1.6;">
      <p>Ciao Chiara! 🌟</p>
      <p>
        Questa settimana hai fatto un lavoro fantastico — hai completato
        <strong>${completedByChiara.length} task</strong> e ogni cosa che hai fatto
        fa la differenza. Che si tratti di piccole commissioni o di impegni più grandi,
        il tuo contributo è prezioso e non passa inosservato. Grazie per l'energia e
        la dedizione che metti in tutto quello che fai! 💪
      </p>

      <p style="margin:20px 0 8px;font-weight:600;">Ecco cosa hai portato a termine:</p>
      <ul style="padding-left:20px;margin:0 0 24px 0;">
        ${listHtml}
      </ul>

      <p>
        Continua così — sei una forza! Ogni task completato è un piccolo traguardo
        di cui andare fiera. Alla prossima settimana! 🎉
      </p>

      <p style="margin-top:32px;color:#999;font-size:12px;">
        Ultimi 7 giorni &nbsp;·&nbsp; ${completedByChiara.length} task completat${completedByChiara.length === 1 ? "o" : "i"}
      </p>
    </div>
  `;

  try {
    await brevo.transactionalEmails.sendTransacEmail({
      sender: { name: "Task Manager", email: "tizianopitisci@gmail.com" },
      to: [
        { email: "chiaradominelli@gmail.com" },
        { email: "tizianopitisci@gmail.com" },
      ],
      subject: `✅ Chiara ha completato ${completedByChiara.length} task questa settimana`,
      htmlContent: html,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent: true, completedCount: completedByChiara.length });
}
