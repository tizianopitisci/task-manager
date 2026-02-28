import { NextResponse } from "next/server";
import { BrevoClient } from "@getbrevo/brevo";

export async function GET() {
  const client = new BrevoClient({ apiKey: process.env.BREVO_API_KEY! });

  try {
    await client.transactionalEmails.sendTransacEmail({
      sender: { name: "Task Manager", email: "tizianopitisci@gmail.com" },
      to: [{ email: "tizianopitisci@gmail.com" }],
      subject: "Test email Task Manager",
      htmlContent: "<p>Se leggi questa email, l’invio funziona 🎉</p>",
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
