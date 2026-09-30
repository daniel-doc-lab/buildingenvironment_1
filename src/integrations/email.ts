import "server-only";
import type { DB } from "@/db";
import { schema } from "@/db";

/**
 * Udgående e-mail. Sender via Resend hvis RESEND_API_KEY er sat, ellers logges mailen i udbakken
 * (synlig under Indstillinger → Notifikationer), så demoen virker uden mailserver.
 */
export async function sendEmail(db: DB, msg: { companyId?: string | null; to: string; subject: string; html: string }) {
  const [row] = await db
    .insert(schema.outbox)
    .values({ companyId: msg.companyId ?? null, to: msg.to, subject: msg.subject, html: msg.html })
    .returning();
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    await db.update(schema.outbox).set({ status: "logged" }).where(eqId(row!.id));
    return;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Fluks <noreply@fluks.dk>", to: msg.to, subject: msg.subject, html: msg.html }),
    });
    await db
      .update(schema.outbox)
      .set({ status: res.ok ? "sent" : "failed", error: res.ok ? null : (await res.text()).slice(0, 300) })
      .where(eqId(row!.id));
  } catch (e) {
    await db.update(schema.outbox).set({ status: "failed", error: String(e) }).where(eqId(row!.id));
  }
}

import { eq } from "drizzle-orm";
const eqId = (id: string) => eq(schema.outbox.id, id);

export function emailLayout(title: string, body: string, cta?: { href: string; label: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f5f7f6;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f1f1a">
<div style="max-width:520px;margin:32px auto;background:#fff;border-radius:14px;padding:28px;border:1px solid #e3e8e5">
<div style="font-weight:700;font-size:18px;color:#0b6b4f;margin-bottom:18px">fluks</div>
<h1 style="font-size:18px;margin:0 0 12px">${title}</h1>
<div style="font-size:14px;line-height:1.55;color:#33443e">${body}</div>
${cta ? `<a href="${cta.href}" style="display:inline-block;margin-top:20px;background:#0b6b4f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:9px;font-weight:600;font-size:14px">${cta.label}</a>` : ""}
</div></body></html>`;
}
