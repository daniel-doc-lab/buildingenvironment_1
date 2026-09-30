"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { actionContext } from "@/server/auth";
import { audit } from "@/server/audit";
import { lookupCvr } from "@/integrations/cvr";
import { normalizeAccount, normalizeCvr, normalizeIban, normalizeReg } from "@/lib/banking";
import type { ActionResult } from "../actions";

export async function saveSupplierAction(id: string | null, form: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await actionContext("editInvoices");
    const s = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" && v.trim() ? v.trim() : null;
    };
    const name = s("name");
    if (!name) throw new Error("Navn er påkrævet");
    const values = {
      name,
      cvr: normalizeCvr(s("cvr")),
      email: s("email"),
      phone: s("phone"),
      address: s("address"),
      bankReg: normalizeReg(s("bankReg")),
      bankAccount: normalizeAccount(s("bankAccount")),
      iban: normalizeIban(s("iban")),
      bic: s("bic"),
      fiCreditor: s("fiCreditor"),
      defaultAccount: s("defaultAccount"),
      defaultVatCode: s("defaultVatCode"),
      defaultPropertyId: s("defaultPropertyId"),
      paymentTermsDays: s("paymentTermsDays") ? Number(s("paymentTermsDays")) : null,
      trusted: form.get("trusted") === "on",
      notes: s("notes"),
    };
    let supplierId = id;
    if (id) {
      const before = await ctx.db.query.suppliers.findFirst({ where: and(eq(schema.suppliers.id, id), eq(schema.suppliers.companyId, ctx.company.id)) });
      if (!before) throw new Error("Leverandør findes ikke");
      const bankChanged = before.bankAccount !== values.bankAccount || before.iban !== values.iban || before.fiCreditor !== values.fiCreditor;
      await ctx.db
        .update(schema.suppliers)
        .set({ ...values, ...(bankChanged ? { bankChangedAt: new Date(), bankVerifiedAt: new Date() } : {}) })
        .where(eq(schema.suppliers.id, id));
      await audit(ctx.db, ctx.company.id, ctx.user.id, "supplier", id, "edited", bankChanged ? { bank: "changed" } : undefined);
    } else {
      const [row] = await ctx.db.insert(schema.suppliers).values({ companyId: ctx.company.id, ...values, bankVerifiedAt: new Date() }).returning({ id: schema.suppliers.id });
      supplierId = row!.id;
      await audit(ctx.db, ctx.company.id, ctx.user.id, "supplier", supplierId, "created");
    }
    revalidatePath("/app/suppliers", "layout");
    return { ok: true, data: { id: supplierId! }, message: "Leverandør gemt" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function enrichFromCvrAction(cvr: string) {
  await actionContext("view");
  return lookupCvr(cvr);
}

export async function verifyBankAction(id: string): Promise<ActionResult> {
  try {
    const ctx = await actionContext("editInvoices");
    await ctx.db.update(schema.suppliers).set({ bankVerifiedAt: new Date() }).where(and(eq(schema.suppliers.id, id), eq(schema.suppliers.companyId, ctx.company.id)));
    await audit(ctx.db, ctx.company.id, ctx.user.id, "supplier", id, "bank_verified");
    revalidatePath(`/app/suppliers/${id}`);
    return { ok: true, message: "Betalingsoplysninger markeret som bekræftet" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
