import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";

const emailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  html: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = emailSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || resendKey.startsWith("YOUR_")) {
    return NextResponse.json({ error: "Resend not configured" }, { status: 500 });
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(resendKey);
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? "noreply@codecinematic.com";

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: parsed.data.to,
      subject: parsed.data.subject,
      html: parsed.data.html,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data?.id ?? "sent" });
  } catch (err) {
    console.error("Email send error:", err);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
