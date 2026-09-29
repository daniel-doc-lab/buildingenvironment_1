import "server-only";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import { accountingFor, propertyFor } from "./integrations";
import { audit } from "../audit";
import { todayISO } from "@/lib/utils";

/** Henter kontoplan, momskoder, afdelinger og leverandører fra regnskabsprogrammet. */
export async function syncMasterData(db: DB, companyId: string) {
  const acc = await accountingFor(db, companyId);
  if (!acc) throw new Error("Intet regnskabsprogram er forbundet");
  const { provider, integration } = acc;
  try {
    const [accounts, vats, depts, suppliers] = await Promise.all([
      provider.fetchAccounts(),
      provider.fetchVatCodes(),
      provider.fetchDepartments(),
      provider.fetchSuppliers().catch(() => []),
    ]);
    for (const a of accounts) {
      await db
        .insert(schema.accounts)
        .values({ companyId, number: a.number, name: a.name, type: a.type, defaultVatCode: a.defaultVatCode })
        .onConflictDoUpdate({
          target: [schema.accounts.companyId, schema.accounts.number],
          set: { name: a.name, type: a.type, defaultVatCode: a.defaultVatCode, active: true },
        });
    }
    for (const v of vats) {
      await db
        .insert(schema.vatCodes)
        .values({ companyId, code: v.code, name: v.name, rate: v.rate })
        .onConflictDoUpdate({ target: [schema.vatCodes.companyId, schema.vatCodes.code], set: { name: v.name, rate: v.rate } });
    }
    const existingDepts = await db.select().from(schema.departments).where(eq(schema.departments.companyId, companyId));
    for (const d of depts) {
      if (!existingDepts.some((e) => e.code === d.code)) await db.insert(schema.departments).values({ companyId, code: d.code, name: d.name });
    }
    let importedSuppliers = 0;
    for (const s of suppliers) {
      const existing =
        (s.cvr &&
          (await db.query.suppliers.findFirst({ where: and(eq(schema.suppliers.companyId, companyId), eq(schema.suppliers.cvr, s.cvr)) }))) ||
        (await db.query.suppliers.findFirst({ where: and(eq(schema.suppliers.companyId, companyId), eq(schema.suppliers.externalId, s.externalId)) }));
      if (existing) {
        await db
          .update(schema.suppliers)
          .set({ externalId: s.externalId, defaultAccount: existing.defaultAccount ?? s.defaultAccount ?? null })
          .where(eq(schema.suppliers.id, existing.id));
      } else {
        await db.insert(schema.suppliers).values({
          companyId,
          name: s.name,
          cvr: s.cvr,
          email: s.email,
          address: s.address,
          bankReg: s.bankReg,
          bankAccount: s.bankAccount,
          externalId: s.externalId,
          defaultAccount: s.defaultAccount ?? null,
        });
        importedSuppliers++;
      }
    }
    await db.update(schema.integrations).set({ lastSyncAt: new Date(), lastError: null, status: "connected" }).where(eq(schema.integrations.id, integration.id));
    return { accounts: accounts.length, vatCodes: vats.length, departments: depts.length, suppliers: importedSuppliers };
  } catch (e) {
    await db.update(schema.integrations).set({ lastError: (e as Error).message }).where(eq(schema.integrations.id, integration.id));
    throw e;
  }
}

/** Bogfører godkendt faktura i regnskabsprogrammet (kassekladde) med bilag vedhæftet. */
export async function bookInvoice(db: DB, invoiceId: string) {
  const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) });
  if (!inv || inv.bookedAt) return null;
  const acc = await accountingFor(db, inv.companyId);
  if (!acc) return null;
  const lines = await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, invoiceId));
  const vats = await db.select().from(schema.vatCodes).where(eq(schema.vatCodes.companyId, inv.companyId));
  const supplier = inv.supplierId ? await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, inv.supplierId) }) : null;
  let supplierExternalId = supplier?.externalId ?? null;
  if (supplier && !supplierExternalId && inv.kind !== "expense") {
    supplierExternalId = await acc.provider.ensureSupplier(supplier);
    await db.update(schema.suppliers).set({ externalId: supplierExternalId }).where(eq(schema.suppliers.id, supplier.id));
  }
  const file = inv.fileId ? await db.query.files.findFirst({ where: eq(schema.files.id, inv.fileId) }) : null;
  const properties = await db.select().from(schema.properties).where(eq(schema.properties.companyId, inv.companyId));
  const { voucher } = await acc.provider.bookInvoice({
    id: inv.id,
    kind: inv.kind,
    supplierExternalId,
    supplierName: inv.supplierName ?? "Ukendt",
    invoiceNumber: inv.invoiceNumber,
    issueDate: inv.issueDate ?? todayISO(),
    dueDate: inv.dueDate,
    currency: inv.currency,
    totalAmount: inv.totalAmount ?? 0,
    description: inv.description,
    lines: lines.map((l) => ({
      description: l.description,
      amount: l.amount,
      accountNumber: l.accountNumber ?? "2790",
      vatCode: l.vatCode,
      vatRate: vats.find((v) => v.code === l.vatCode)?.rate ?? 0,
      departmentCode: l.departmentCode ?? properties.find((p) => p.id === (l.propertyId ?? inv.propertyId))?.departmentCode ?? inv.departmentCode,
    })),
    file: file ? { name: file.name, mime: file.mime, data: file.data } : null,
  });
  await db.update(schema.invoices).set({ bookedAt: new Date(), externalVoucher: voucher }).where(eq(schema.invoices.id, invoiceId));
  await audit(db, inv.companyId, null, "invoice", invoiceId, "booked", { voucher, provider: acc.provider.id });

  // Send udgiften videre til ejendomssystemet
  const propId = inv.propertyId ?? lines.find((l) => l.propertyId)?.propertyId;
  const prop = propId ? properties.find((p) => p.id === propId) : null;
  if (prop?.externalId) {
    const pf = await propertyFor(db, inv.companyId);
    const unit = inv.unitId ? await db.query.units.findFirst({ where: eq(schema.units.id, inv.unitId) }) : null;
    await pf?.provider
      .pushExpense?.({
        propertyExternalId: prop.externalId,
        unitExternalId: unit?.externalId ?? null,
        amount: inv.totalAmount ?? 0,
        date: inv.issueDate ?? todayISO(),
        text: `${inv.supplierName}: ${inv.description ?? ""}`.slice(0, 200),
        voucher,
      })
      .catch(() => undefined);
  }
  return voucher;
}

export async function registerPayment(db: DB, invoiceId: string, p: { amount: number; date: string; bankLedgerAccount: string }) {
  const inv = await db.query.invoices.findFirst({ where: eq(schema.invoices.id, invoiceId) });
  if (!inv) return;
  const acc = await accountingFor(db, inv.companyId);
  if (!acc) return;
  const supplier = inv.supplierId ? await db.query.suppliers.findFirst({ where: eq(schema.suppliers.id, inv.supplierId) }) : null;
  await acc.provider.registerPayment({
    supplierExternalId: supplier?.externalId ?? null,
    invoiceNumber: inv.invoiceNumber,
    amount: p.amount,
    date: p.date,
    bankLedgerAccount: p.bankLedgerAccount,
    text: `Betaling ${inv.supplierName ?? ""} ${inv.invoiceNumber ?? ""}`.trim(),
  });
  await audit(db, inv.companyId, null, "invoice", invoiceId, "payment_booked");
}

/** Synkroniserer ejendomme og lejemål fra Boligflow. */
export async function syncProperties(db: DB, companyId: string, list?: Awaited<ReturnType<NonNullable<Awaited<ReturnType<typeof propertyFor>>>["provider"]["fetchProperties"]>>) {
  let props = list;
  const pf = list ? null : await propertyFor(db, companyId);
  if (!props) {
    if (!pf) throw new Error("Boligflow er ikke forbundet");
    props = await pf.provider.fetchProperties();
  }
  let created = 0;
  for (const p of props) {
    let row = await db.query.properties.findFirst({
      where: and(eq(schema.properties.companyId, companyId), eq(schema.properties.externalId, p.externalId)),
    });
    if (row) {
      await db.update(schema.properties).set({ name: p.name, address: p.address, zip: p.zip, city: p.city }).where(eq(schema.properties.id, row.id));
    } else {
      [row] = await db
        .insert(schema.properties)
        .values({ companyId, externalId: p.externalId, name: p.name, address: p.address, zip: p.zip, city: p.city, departmentCode: p.departmentCode ?? null })
        .returning();
      created++;
    }
    const units = await db.select().from(schema.units).where(eq(schema.units.propertyId, row!.id));
    for (const u of p.units) {
      const ex = units.find((x) => x.externalId === u.externalId);
      if (ex) await db.update(schema.units).set({ name: u.name, tenantName: u.tenantName, areaM2: u.areaM2 }).where(eq(schema.units.id, ex.id));
      else await db.insert(schema.units).values({ propertyId: row!.id, externalId: u.externalId, name: u.name, tenantName: u.tenantName, areaM2: u.areaM2 });
    }
  }
  if (pf) await db.update(schema.integrations).set({ lastSyncAt: new Date(), lastError: null }).where(eq(schema.integrations.id, pf.integration.id));
  return { properties: props.length, created };
}
