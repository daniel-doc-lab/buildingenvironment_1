"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@/db";
import { actionContext } from "@/server/auth";
import { audit } from "@/server/audit";
import { ingestDocument, processInvoice } from "@/server/services/ingest";
import { autoCode } from "@/server/services/coding";
import { runChecks } from "@/server/services/checks";
import { submitForApproval, decide } from "@/server/services/approvals";
import { markInvoicePaidManually } from "@/server/services/bank";
import { resolveSupplier } from "@/server/services/suppliers";
import { ACCEPTED_MIME, guessMime } from "@/server/services/files";
import { normalizeAccount, normalizeIban, normalizeReg, parseFik } from "@/lib/banking";
import { parseAmount, todayISO, addDays } from "@/lib/utils";

export type ActionResult<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

async function run<T>(fn: () => Promise<T>, paths: string[] = ["/app"], message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    for (const p of paths) revalidatePath(p, "layout");
    return { ok: true, data, message };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Noget gik galt" };
  }
}

export async function markNotificationsReadAction() {
  const ctx = await actionContext();
  await ctx.db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(and(eq(schema.notifications.userId, ctx.user.id), eq(schema.notifications.companyId, ctx.company.id), isNull(schema.notifications.readAt)));
  revalidatePath("/app", "layout");
}

// ---------------------------------------------------------------------------
// Upload og indlæsning
// ---------------------------------------------------------------------------

export async function uploadDocumentsAction(form: FormData): Promise<ActionResult<{ ids: string[] }>> {
  const kind = form.get("kind") === "expense" ? "expense" : "invoice";
  return run(async () => {
    const ctx = await actionContext(kind === "expense" ? "submitExpenses" : "editInvoices");
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) throw new Error("Vælg mindst én fil");
    const ids: string[] = [];
    for (const f of files) {
      const mime = guessMime(f.name, f.type);
      if (!ACCEPTED_MIME.includes(mime)) throw new Error(`${f.name}: filtypen understøttes ikke (PDF, billede eller XML)`);
      const id = await ingestDocument(ctx.db, {
        companyId: ctx.company.id,
        userId: ctx.user.id,
        file: { name: f.name, mime, data: Buffer.from(await f.arrayBuffer()) },
        source: form.get("source") === "mobile" ? "mobile" : "upload",
        kind,
      });
      if (kind === "expense") {
        const note = String(form.get("note") ?? "").trim();
        if (note) await ctx.db.insert(schema.comments).values({ invoiceId: id, userId: ctx.user.id, body: note });
        const propertyId = String(form.get("propertyId") ?? "");
        if (propertyId) {
          await ctx.db.update(schema.invoices).set({ propertyId }).where(eq(schema.invoices.id, id));
          await ctx.db.update(schema.invoiceLines).set({ propertyId }).where(eq(schema.invoiceLines.invoiceId, id));
        }
        // Udlæg sendes automatisk til godkendelse når de er læst
        const inv = await ctx.db.query.invoices.findFirst({ where: eq(schema.invoices.id, id) });
        if (inv?.status === "review") await submitForApproval(ctx.db, id, ctx.user.id).catch(() => undefined);
      }
      ids.push(id);
    }
    return { ids };
  }, ["/app"], files(form) === 1 ? "Dokumentet er læst" : "Dokumenterne er læst");
}

function files(form: FormData) {
  return form.getAll("files").filter((f) => f instanceof File && f.size > 0).length;
}

export async function createSampleInvoiceAction(kind: "normal" | "new" | "fraud" = "normal"): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const ctx = await actionContext("editInvoices");
    const { DEMO_SUPPLIERS, NEW_SUPPLIER_EXAMPLES, DEMO_COMPANY } = await import("@/server/demo/catalog");
    const { renderDemoInvoice } = await import("@/server/demo/invoice-pdf");
    const { specFor } = await import("@/server/seed");
    const props = await ctx.db.select().from(schema.properties).where(eq(schema.properties.companyId, ctx.company.id));
    const rand = Math.random;
    const pool = kind === "new" ? NEW_SUPPLIER_EXAMPLES : DEMO_SUPPLIERS.filter((s) => s.payment.kind !== "betalingsservice");
    const s = pool[Math.floor(rand() * pool.length)]!;
    const prop = s.property && props.length ? props[Math.floor(rand() * props.length)]! : null;
    const spec = specFor(s, {
      invoiceNumber: `${s.key.slice(0, 2).toUpperCase()}-${Math.floor(rand() * 900000 + 100000)}`,
      issueDate: addDays(todayISO(), -Math.floor(rand() * 5)),
      rand,
      property: prop ? { externalId: prop.externalId ?? "", name: prop.name, address: prop.address, zip: prop.zip, city: prop.city, units: [] } : null,
    });
    spec.customer = { name: ctx.company.name, address: ctx.company.address ?? DEMO_COMPANY.address, cvr: ctx.company.cvr };
    if (kind === "fraud" && s.payment.kind === "bank") {
      spec.payment = { kind: "bank", reg: "9570", account: String(Math.floor(rand() * 9e9)).padStart(10, "0") };
      spec.note = "Vi har skiftet bank – brug venligst det nye kontonummer.";
    }
    const pdf = await renderDemoInvoice(spec);
    const id = await ingestDocument(ctx.db, {
      companyId: ctx.company.id,
      userId: ctx.user.id,
      file: { name: `${s.name.split(" ")[0]}-${spec.invoiceNumber}.pdf`, mime: "application/pdf", data: pdf },
      source: "email",
    });
    return { id };
  }, ["/app"], "Eksempelfaktura modtaget og læst");
}

// ---------------------------------------------------------------------------
// Redigering af faktura
// ---------------------------------------------------------------------------

const LineSchema = z.object({
  id: z.string().optional(),
  description: z.string(),
  quantity: z.coerce.number().default(1),
  amount: z.string(),
  vatCode: z.string().nullable().optional(),
  accountNumber: z.string().nullable().optional(),
  departmentCode: z.string().nullable().optional(),
  propertyId: z.string().nullable().optional(),
  unitId: z.string().nullable().optional(),
});

export async function saveInvoiceAction(invoiceId: string, form: FormData): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionContext("editInvoices");
    const inv = await ctx.db.query.invoices.findFirst({ where: and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.companyId, ctx.company.id)) });
    if (!inv) throw new Error("Faktura findes ikke");
    if (["paid", "scheduled"].includes(inv.status)) throw new Error("Fakturaen er sat til betaling og kan ikke ændres");
    const s = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
    };

    let supplierId = s("supplierId");
    const supplierName = s("supplierName");
    if (!supplierId && supplierName) {
      const { supplier } = await resolveSupplier(ctx.db, ctx.company.id, { name: supplierName, cvr: s("supplierCvr") });
      supplierId = supplier?.id ?? null;
    }
    const supplier = supplierId ? await ctx.db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, supplierId) }) : null;

    const method = s("paymentMethod");
    const fik = s("fikLine") ? parseFik(s("fikLine")!) : null;
    const patch: Partial<typeof schema.invoices.$inferInsert> = {
      supplierId: supplier?.id ?? null,
      supplierName: supplier?.name ?? supplierName ?? inv.supplierName,
      invoiceNumber: s("invoiceNumber"),
      issueDate: s("issueDate"),
      dueDate: s("dueDate"),
      currency: s("currency") ?? "DKK",
      amountExVat: parseAmount(s("amountExVat") ?? ""),
      vatAmount: parseAmount(s("vatAmount") ?? ""),
      totalAmount: parseAmount(s("totalAmount") ?? ""),
      paymentMethod: method,
      fikType: method === "fik" ? fik?.type ?? inv.fikType : null,
      fikCreditor: method === "fik" ? fik?.creditor ?? inv.fikCreditor : null,
      fikPaymentId: method === "fik" ? fik?.paymentId ?? null : null,
      bankReg: method === "domestic" ? normalizeReg(s("bankReg")) : null,
      bankAccount: method === "domestic" ? normalizeAccount(s("bankAccount")) : null,
      iban: method === "iban" ? normalizeIban(s("iban")) : null,
      bic: method === "iban" ? s("bic") : null,
      paymentMessage: s("paymentMessage"),
      description: s("description"),
      propertyId: s("propertyId"),
      unitId: s("unitId"),
      departmentCode: s("departmentCode"),
    };
    if (method === "fik" && s("fikLine") && !fik) throw new Error("FI-kodelinjen kunne ikke læses. Formatet er fx +71<000000012345678+85012345<");
    await ctx.db.update(schema.invoices).set(patch).where(eq(schema.invoices.id, invoiceId));

    const linesRaw = s("lines");
    if (linesRaw) {
      const parsed = z.array(LineSchema).parse(JSON.parse(linesRaw));
      const before = await ctx.db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, invoiceId));
      await ctx.db.delete(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, invoiceId));
      if (parsed.length) {
        await ctx.db.insert(schema.invoiceLines).values(
          parsed.map((l, i) => {
            const prev = before.find((b) => b.id === l.id);
            const changed = prev && (prev.accountNumber !== (l.accountNumber ?? null) || prev.vatCode !== (l.vatCode ?? null));
            return {
              invoiceId,
              position: i,
              description: l.description,
              quantity: l.quantity,
              amount: parseAmount(l.amount) ?? 0,
              vatCode: l.vatCode || null,
              accountNumber: l.accountNumber || null,
              departmentCode: l.departmentCode || null,
              propertyId: l.propertyId || patch.propertyId || null,
              unitId: l.unitId || null,
              aiSuggested: prev ? prev.aiSuggested && !changed : false,
              aiConfidence: prev && !changed ? prev.aiConfidence : null,
              aiReason: prev && !changed ? prev.aiReason : changed ? "Rettet manuelt" : null,
            };
          }),
        );
      }
    }
    const fresh = (await ctx.db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) }))!;
    const flags = await runChecks(ctx.db, fresh);
    await ctx.db.update(schema.invoices).set({ flags }).where(eq(schema.invoices.id, invoiceId));
    await audit(ctx.db, ctx.company.id, ctx.user.id, "invoice", invoiceId, "edited");
  }, [`/app/invoices/${invoiceId}`, "/app"], "Gemt");
}

export async function reprocessInvoiceAction(invoiceId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionContext("editInvoices");
    await assertInvoice(ctx, invoiceId);
    await ctx.db.update(schema.invoices).set({ status: "processing" }).where(eq(schema.invoices.id, invoiceId));
    await processInvoice(ctx.db, invoiceId, { noAutoSubmit: true });
    await audit(ctx.db, ctx.company.id, ctx.user.id, "invoice", invoiceId, "reprocessed");
  }, [`/app/invoices/${invoiceId}`], "Dokumentet er læst igen");
}

export async function recodeInvoiceAction(invoiceId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionContext("editInvoices");
    await assertInvoice(ctx, invoiceId);
    await autoCode(ctx.db, invoiceId, { force: true });
  }, [`/app/invoices/${invoiceId}`], "AI har konteret linjerne");
}

async function assertInvoice(ctx: Awaited<ReturnType<typeof actionContext>>, invoiceId: string) {
  const inv = await ctx.db.query.invoices.findFirst({ where: and(eq(schema.invoices.id, invoiceId), eq(schema.invoices.companyId, ctx.company.id)) });
  if (!inv) throw new Error("Faktura findes ikke");
  return inv;
}

export async function submitInvoiceAction(invoiceId: string): Promise<ActionResult<{ status: string; workflow: string | null }>> {
  return run(async () => {
    const ctx = await actionContext("editInvoices");
    await assertInvoice(ctx, invoiceId);
    return submitForApproval(ctx.db, invoiceId, ctx.user.id);
  }, [`/app/invoices/${invoiceId}`, "/app"]);
}

export async function decideAction(invoiceId: string, decision: "approve" | "reject", comment?: string): Promise<ActionResult<{ status: string }>> {
  return run(async () => {
    const ctx = await actionContext("approve");
    await assertInvoice(ctx, invoiceId);
    if (decision === "reject" && !comment?.trim()) throw new Error("Skriv en begrundelse for afvisningen");
    return decide(ctx.db, invoiceId, ctx.user.id, decision, comment);
  }, [`/app/invoices/${invoiceId}`, "/app"], decision === "approve" ? "Godkendt" : "Afvist");
}

export async function bulkApproveAction(invoiceIds: string[]): Promise<ActionResult<{ approved: number; failed: number }>> {
  return run(async () => {
    const ctx = await actionContext("approve");
    let approved = 0;
    let failed = 0;
    for (const id of invoiceIds) {
      try {
        await assertInvoice(ctx, id);
        await decide(ctx.db, id, ctx.user.id, "approve");
        approved++;
      } catch {
        failed++;
      }
    }
    return { approved, failed };
  });
}

export async function bulkSubmitAction(invoiceIds: string[]): Promise<ActionResult<{ submitted: number; errors: string[] }>> {
  return run(async () => {
    const ctx = await actionContext("editInvoices");
    let submitted = 0;
    const errors: string[] = [];
    for (const id of invoiceIds) {
      try {
        const inv = await assertInvoice(ctx, id);
        await submitForApproval(ctx.db, id, ctx.user.id);
        submitted++;
        void inv;
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    return { submitted, errors };
  });
}

export async function dismissFlagAction(invoiceId: string, code: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionContext("editInvoices");
    const inv = await assertInvoice(ctx, invoiceId);
    const flags = inv.flags.map((f) => (f.code === code ? { ...f, dismissed: true } : f));
    await ctx.db.update(schema.invoices).set({ flags }).where(eq(schema.invoices.id, invoiceId));
    await audit(ctx.db, ctx.company.id, ctx.user.id, "invoice", invoiceId, "flag_dismissed", { code });
    if (code === "bank_changed" && inv.supplierId) {
      await ctx.db.update(schema.suppliers).set({ bankVerifiedAt: new Date() }).where(eq(schema.suppliers.id, inv.supplierId));
      await ctx.db.insert(schema.comments).values({
        invoiceId,
        userId: ctx.user.id,
        body: "Nye betalingsoplysninger er bekræftet telefonisk med leverandøren.",
      });
    }
  }, [`/app/invoices/${invoiceId}`]);
}

export async function rejectAsDuplicateAction(invoiceId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionContext("editInvoices");
    await assertInvoice(ctx, invoiceId);
    await ctx.db.update(schema.invoices).set({ status: "rejected", rejectedReason: "Dublet" }).where(eq(schema.invoices.id, invoiceId));
    await audit(ctx.db, ctx.company.id, ctx.user.id, "invoice", invoiceId, "rejected", { reason: "duplicate" });
  }, ["/app"], "Markeret som dublet");
}

export async function deleteInvoiceAction(invoiceId: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionContext("editInvoices");
    const inv = await assertInvoice(ctx, invoiceId);
    if (!["review", "rejected", "processing"].includes(inv.status)) throw new Error("Kun fakturaer der ikke er godkendt kan slettes");
    await ctx.db.delete(schema.invoices).where(eq(schema.invoices.id, invoiceId));
    await audit(ctx.db, ctx.company.id, ctx.user.id, "invoice", invoiceId, "deleted", { supplier: inv.supplierName, number: inv.invoiceNumber });
  }, ["/app"], "Slettet");
}

export async function addCommentAction(invoiceId: string, body: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionContext("view");
    await assertInvoice(ctx, invoiceId);
    if (!body.trim()) throw new Error("Skriv en kommentar");
    await ctx.db.insert(schema.comments).values({ invoiceId, userId: ctx.user.id, body: body.trim().slice(0, 2000) });
    // @mentions → notifikation
    const members = await ctx.db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.memberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
      .where(eq(schema.memberships.companyId, ctx.company.id));
    const mentioned = members.filter((m) => body.toLowerCase().includes(`@${m.name.split(" ")[0]!.toLowerCase()}`) && m.id !== ctx.user.id);
    if (mentioned.length) {
      const { notify } = await import("@/server/services/notifications");
      await notify(ctx.db, {
        companyId: ctx.company.id,
        userIds: mentioned.map((m) => m.id),
        type: "mention",
        title: `${ctx.user.name} nævnte dig i en kommentar`,
        body: body.slice(0, 140),
        link: `/app/invoices/${invoiceId}`,
        email: true,
      });
    }
  }, [`/app/invoices/${invoiceId}`]);
}

export async function markPaidAction(invoiceId: string, date: string): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionContext("pay");
    await markInvoicePaidManually(ctx.db, { companyId: ctx.company.id, userId: ctx.user.id }, invoiceId, date || todayISO());
  }, [`/app/invoices/${invoiceId}`, "/app"], "Markeret som betalt");
}

export async function archiveWithoutPaymentAction(invoiceIds: string[]): Promise<ActionResult> {
  return run(async () => {
    const ctx = await actionContext("editInvoices");
    await ctx.db
      .update(schema.invoices)
      .set({ status: "archived" })
      .where(and(eq(schema.invoices.companyId, ctx.company.id), inArray(schema.invoices.id, invoiceIds)));
  }, ["/app"], "Arkiveret");
}
