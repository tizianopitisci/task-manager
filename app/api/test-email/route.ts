import { NextResponse } from "next/server";
import { Resend } from "resend";

export async function GET() {
  const resend = new Resend(process.env.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from: "Task Manager <onboarding@resend.dev>",
    to: ["tizianopitisci@gmail.com"],
    subject: "Test email Task Manager",
    html: "<p>Se leggi questa email, l’invio funziona 🎉</p>",
  });

  if (error) {
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
