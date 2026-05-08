import { z } from "zod";

import { apiError, apiSuccess, readJsonBody } from "@/lib/api-response";
import { getSession } from "@/lib/auth";

const emailSchema = z.object({
  to: z.string().email(),
  subject: z.string().trim().min(1).max(200),
  html: z.string().min(1).max(100_000),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.isAdmin) {
    return apiError("unauthorized", "Unauthorized", 401);
  }

  const parsed = emailSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return apiError("invalid_payload", "Invalid payload", 400, parsed.error.flatten());
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || resendKey.startsWith("YOUR_")) {
    return apiError("not_configured", "Resend not configured", 500);
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
      return apiError("upstream_error", error.message, 502);
    }

    return apiSuccess({ id: data?.id ?? "sent" });
  } catch (err) {
    console.error("Email send error:", err);
    return apiError("upstream_error", "Failed to send email", 500);
  }
}
