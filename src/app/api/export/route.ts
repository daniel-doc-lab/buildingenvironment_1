import { NextResponse } from "next/server";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { schema } from "@/db";
import { getContext, can } from "@/server/auth";

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const kr = (ore: number | null) => (ore == null ? "" : (ore / 100).toFixed(2).replace(".", ","));

/** CSV-eksport (semikolonsepareret, dansk decimalkomma – åbner direkte i Excel). */
export async function GET(req: Request) {
  const ctx = await getContext();
  if (!ctx?.company || !can(ctx.role, "view")) return new NextResponse("Ikke logget ind", { status: 401 });
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "invoices";
  const from = url.searchParams.get("from") ?? "2000-01-01";
  const to = url.searchParams.get("to") ?? "2999-12-31";
  const where = and(eq(schema.invoices.companyId, ctx.company.id), gte(schema.invoices.issueDate, from), lte(schema.invoices.issueDate, to));
  let rows: unknown[][];
  let header: string[];
  if (type === "lines") {
    header = ["Fakturadato", "Leverandør", "Fakturanr.", "Linje", "Konto", "Momskode", "Ejendom", "Beløb ekskl. moms", "Status", "Bilag"];
    const data = await ctx.db
      .select({ inv: schema.invoices, l: schema.invoiceLines, property: schema.properties.name })
      .from(schema.invoiceLines)
      .innerJoin(schema.invoices, eq(schema.invoices.id, schema.invoiceLines.invoiceId))
      .leftJoin(schema.properties, eq(schema.properties.id, sql`coalesce(${schema.invoiceLines.propertyId}, ${schema.invoices.propertyId})`))
      .where(where)
      .orderBy(schema.invoices.issueDate);
    rows = data.map(({ inv, l, property }) => [inv.issueDate, inv.supplierName, inv.invoiceNumber, l.description, l.accountNumber, l.vatCode, property, kr(l.amount), inv.status, inv.externalVoucher]);
  } else {
    header = ["Fakturadato", "Forfald", "Leverandør", "CVR", "Fakturanr.", "Type", "Ekskl. moms", "Moms", "Total", "Valuta", "Status", "Betalt", "Bilag"];
    const data = await ctx.db.select().from(schema.invoices).where(where).orderBy(schema.invoices.issueDate);
    rows = data.map((i) => [i.issueDate, i.dueDate, i.supplierName, i.supplierCvr, i.invoiceNumber, i.kind, kr(i.amountExVat), kr(i.vatAmount), kr(i.totalAmount), i.currency, i.status, i.paidAt?.toISOString().slice(0, 10), i.externalVoucher]);
  }
  const csv = "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fluks-${type}-${from}-${to}.csv"`,
    },
  });
}
