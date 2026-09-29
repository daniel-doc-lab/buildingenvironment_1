"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { actionContext } from "@/server/auth";
import { syncProperties } from "@/server/services/accounting";
import { importPropertyCsv } from "@/integrations/property/boligflow";
import { parseAmount } from "@/lib/utils";
import type { ActionResult } from "../actions";

export async function syncPropertiesAction(): Promise<ActionResult> {
  try {
    const ctx = await actionContext("manageIntegrations");
    const r = await syncProperties(ctx.db, ctx.company.id);
    revalidatePath("/app/properties", "layout");
    return { ok: true, message: `${r.properties} ejendomme synkroniseret fra Boligflow (${r.created} nye)` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function importPropertiesCsvAction(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await actionContext("manageIntegrations");
    const f = form.get("file");
    if (!(f instanceof File)) throw new Error("Vælg en CSV-fil");
    const list = importPropertyCsv(await f.text());
    if (!list.length) throw new Error("Filen indeholdt ingen ejendomme");
    const r = await syncProperties(ctx.db, ctx.company.id, list);
    await ctx.db
      .update(schema.companies)
      .set({ settings: { ...ctx.company.settings, propertyModule: true } })
      .where(eq(schema.companies.id, ctx.company.id));
    revalidatePath("/app", "layout");
    return { ok: true, message: `${r.properties} ejendomme importeret` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function savePropertyAction(id: string | null, form: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await actionContext("editInvoices");
    const name = String(form.get("name") ?? "").trim();
    if (!name) throw new Error("Navn er påkrævet");
    const values = {
      name,
      address: String(form.get("address") ?? "").trim() || null,
      annualBudget: parseAmount(String(form.get("annualBudget") ?? "")),
      departmentCode: String(form.get("departmentCode") ?? "").trim() || null,
    };
    if (id) {
      await ctx.db.update(schema.properties).set(values).where(and(eq(schema.properties.id, id), eq(schema.properties.companyId, ctx.company.id)));
      revalidatePath(`/app/properties/${id}`);
      return { ok: true, data: { id }, message: "Gemt" };
    }
    const [row] = await ctx.db.insert(schema.properties).values({ companyId: ctx.company.id, ...values }).returning({ id: schema.properties.id });
    revalidatePath("/app/properties");
    return { ok: true, data: { id: row!.id }, message: "Ejendom oprettet" };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
