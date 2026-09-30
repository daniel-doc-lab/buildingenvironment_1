import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import { CLAUDE_MODEL } from "@/integrations/ai/claude";
import { decrypt } from "@/lib/crypto";
import { addDays, formatDate, formatMoney, todayISO } from "@/lib/utils";
import { STATUS } from "@/lib/labels";
import { getIntegration } from "./integrations";
import { forecast } from "./cashflow";

export type AssistantItem = {
  id: string;
  supplier: string;
  number: string | null;
  amount: number | null;
  dueDate: string | null;
  status: string;
};
export type AssistantAction = { type: "approve"; invoiceIds: string[]; label: string } | { type: "navigate"; href: string; label: string };
export type AssistantReply = { answer: string; items?: AssistantItem[]; actions?: AssistantAction[]; engine: "claude" | "demo" };

type Ctx = { db: DB; companyId: string; userId: string };

// ---------------------------------------------------------------------------
// Værktøjer (bruges af både Claude og demo-motoren)
// ---------------------------------------------------------------------------

async function searchInvoices(
  ctx: Ctx,
  f: { text?: string | null; statuses?: string[] | null; dueFrom?: string | null; dueTo?: string | null; minAmount?: number | null; maxAmount?: number | null; limit?: number | null; onlyMine?: boolean | null },
) {
  const conds = [eq(schema.invoices.companyId, ctx.companyId)];
  if (f.text) {
    const q = `%${f.text}%`;
    conds.push(or(ilike(schema.invoices.supplierName, q), ilike(schema.invoices.invoiceNumber, q), ilike(schema.invoices.description, q))!);
  }
  if (f.statuses?.length) conds.push(inArray(schema.invoices.status, f.statuses as never[]));
  if (f.dueFrom) conds.push(gte(schema.invoices.dueDate, f.dueFrom));
  if (f.dueTo) conds.push(lte(schema.invoices.dueDate, f.dueTo));
  if (f.minAmount != null) conds.push(gte(schema.invoices.totalAmount, Math.round(f.minAmount * 100)));
  if (f.maxAmount != null) conds.push(lte(schema.invoices.totalAmount, Math.round(f.maxAmount * 100)));
  let rows = await ctx.db
    .select()
    .from(schema.invoices)
    .where(and(...conds))
    .orderBy(schema.invoices.dueDate)
    .limit(Math.min(f.limit ?? 25, 50));
  if (f.onlyMine) {
    const mine = await ctx.db
      .select({ id: schema.approvals.invoiceId })
      .from(schema.approvals)
      .where(and(eq(schema.approvals.userId, ctx.userId), eq(schema.approvals.status, "pending")));
    const ids = new Set(mine.map((m) => m.id));
    rows = rows.filter((r) => ids.has(r.id));
  }
  return rows.map<AssistantItem>((r) => ({
    id: r.id,
    supplier: r.supplierName ?? "Ukendt",
    number: r.invoiceNumber,
    amount: r.totalAmount,
    dueDate: r.dueDate,
    status: r.status,
  }));
}

async function spendSummary(ctx: Ctx, f: { groupBy: "supplier" | "account" | "property" | "month"; from?: string | null; to?: string | null; filter?: string | null }) {
  const from = f.from ?? addDays(todayISO(), -365);
  const to = f.to ?? todayISO();
  const rows = await ctx.db
    .select({
      supplier: schema.invoices.supplierName,
      issueDate: schema.invoices.issueDate,
      account: schema.invoiceLines.accountNumber,
      accountName: schema.accounts.name,
      property: schema.properties.name,
      amount: schema.invoiceLines.amount,
    })
    .from(schema.invoiceLines)
    .innerJoin(schema.invoices, eq(schema.invoices.id, schema.invoiceLines.invoiceId))
    .leftJoin(schema.accounts, and(eq(schema.accounts.companyId, schema.invoices.companyId), eq(schema.accounts.number, schema.invoiceLines.accountNumber)))
    .leftJoin(schema.properties, eq(schema.properties.id, sql`coalesce(${schema.invoiceLines.propertyId}, ${schema.invoices.propertyId})`))
    .where(
      and(
        eq(schema.invoices.companyId, ctx.companyId),
        inArray(schema.invoices.status, ["approved", "scheduled", "paid", "archived"]),
        gte(schema.invoices.issueDate, from),
        lte(schema.invoices.issueDate, to),
      ),
    );
  const filter = f.filter?.toLowerCase();
  const groups = new Map<string, number>();
  for (const r of rows) {
    if (filter && ![r.supplier, r.property, r.accountName, r.account].some((v) => v?.toLowerCase().includes(filter))) continue;
    const key =
      f.groupBy === "supplier"
        ? r.supplier ?? "Ukendt"
        : f.groupBy === "account"
          ? `${r.account ?? "?"} ${r.accountName ?? ""}`.trim()
          : f.groupBy === "property"
            ? r.property ?? "Ingen ejendom"
            : (r.issueDate ?? "").slice(0, 7);
    groups.set(key, (groups.get(key) ?? 0) + r.amount);
  }
  return {
    from,
    to,
    total: [...groups.values()].reduce((s, v) => s + v, 0),
    rows: [...groups.entries()].map(([key, amount]) => ({ key, amount })).sort((a, b) => (f.groupBy === "month" ? a.key.localeCompare(b.key) : b.amount - a.amount)),
  };
}

async function overview(ctx: Ctx) {
  const today = todayISO();
  const [open] = await ctx.db
    .select({ n: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${schema.invoices.totalAmount}),0)::bigint` })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.companyId, ctx.companyId), inArray(schema.invoices.status, ["review", "pending_approval", "approved", "scheduled"])));
  const [overdue] = await ctx.db
    .select({ n: sql<number>`count(*)::int`, sum: sql<number>`coalesce(sum(${schema.invoices.totalAmount}),0)::bigint` })
    .from(schema.invoices)
    .where(and(eq(schema.invoices.companyId, ctx.companyId), inArray(schema.invoices.status, ["review", "pending_approval", "approved"]), lte(schema.invoices.dueDate, addDays(today, -1))));
  const accounts = await ctx.db.select().from(schema.bankAccounts).where(eq(schema.bankAccounts.companyId, ctx.companyId));
  const balance = accounts.reduce((s, a) => s + (a.balance ?? 0), 0);
  return { openCount: open?.n ?? 0, openSum: Number(open?.sum ?? 0), overdueCount: overdue?.n ?? 0, overdueSum: Number(overdue?.sum ?? 0), balance };
}

// ---------------------------------------------------------------------------
// Claude-motor
// ---------------------------------------------------------------------------

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_invoices",
    description:
      "Søg i virksomhedens fakturaer og udlæg. Status-værdier: review (til gennemsyn), pending_approval, approved, scheduled, paid, rejected, archived. Beløb i kroner.",
    input_schema: {
      type: "object",
      properties: {
        text: { type: ["string", "null"], description: "Fritekst: leverandør, fakturanr. eller beskrivelse" },
        statuses: { type: ["array", "null"], items: { type: "string" } },
        dueFrom: { type: ["string", "null"], description: "YYYY-MM-DD" },
        dueTo: { type: ["string", "null"], description: "YYYY-MM-DD" },
        minAmount: { type: ["number", "null"] },
        maxAmount: { type: ["number", "null"] },
        onlyMine: { type: ["boolean", "null"], description: "Kun fakturaer der venter på brugerens godkendelse" },
        limit: { type: ["number", "null"] },
      },
      required: ["text", "statuses", "dueFrom", "dueTo", "minAmount", "maxAmount", "onlyMine", "limit"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "spend_summary",
    description: "Summerede udgifter ekskl. moms grupperet efter leverandør, konto, ejendom eller måned. Beløb returneres i øre.",
    input_schema: {
      type: "object",
      properties: {
        groupBy: { type: "string", enum: ["supplier", "account", "property", "month"] },
        from: { type: ["string", "null"] },
        to: { type: ["string", "null"] },
        filter: { type: ["string", "null"], description: "Filtrér på leverandør-, ejendoms- eller kontonavn" },
      },
      required: ["groupBy", "from", "to", "filter"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "overview",
    description: "Nøgletal: åbne fakturaer, forfaldne fakturaer og banksaldo (øre).",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    name: "cashflow_forecast",
    description: "Likviditetsprognose for de næste N dage (øre), med laveste saldo og dato.",
    input_schema: {
      type: "object",
      properties: { days: { type: "number" } },
      required: ["days"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "propose_approval",
    description:
      "Foreslå at brugeren godkender bestemte fakturaer. Handlingen udføres IKKE – brugeren får en knap til at bekræfte. Brug kun fakturaer der venter på brugerens godkendelse (onlyMine).",
    input_schema: {
      type: "object",
      properties: { invoiceIds: { type: "array", items: { type: "string" } }, label: { type: "string" } },
      required: ["invoiceIds", "label"],
      additionalProperties: false,
    },
    strict: true,
  },
];

async function runClaude(ctx: Ctx, apiKey: string, question: string, companyName: string): Promise<AssistantReply> {
  const client = new Anthropic({ apiKey });
  const items: AssistantItem[] = [];
  const actions: AssistantAction[] = [];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: question }];
  const system = `Du er Fluks' AI-assistent for ${companyName}. Du hjælper med fakturaer, godkendelser, betalinger og udgifter.
Dagens dato er ${todayISO()}. Svar kort og præcist på dansk. Beløb vises som "12.345,00 kr." (værktøjerne returnerer øre – divider med 100).
Brug værktøjerne til at finde data; gæt aldrig tal. Du kan ikke selv godkende eller betale – brug propose_approval så brugeren kan bekræfte.`;

  for (let i = 0; i < 6; i++) {
    const res = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system,
      tools: TOOLS,
      messages,
    });
    if (res.stop_reason === "refusal") return { answer: "Det kan jeg desværre ikke hjælpe med.", engine: "claude" };
    messages.push({ role: "assistant", content: res.content });
    const uses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !uses.length) {
      const text = res.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { answer: text || "Færdig.", items: dedupe(items), actions, engine: "claude" };
    }
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const u of uses) {
      try {
        const input = u.input as never;
        let out: unknown;
        if (u.name === "search_invoices") {
          const r = await searchInvoices(ctx, input);
          items.push(...r);
          out = r;
        } else if (u.name === "spend_summary") out = await spendSummary(ctx, input);
        else if (u.name === "overview") out = await overview(ctx);
        else if (u.name === "cashflow_forecast") {
          const f = await forecast(ctx.db, ctx.companyId, Math.min(120, Number((input as { days: number }).days) || 30));
          out = { start: f.start, lowest: f.lowest, end: f.series.at(-1) };
        } else if (u.name === "propose_approval") {
          const inp = input as unknown as { invoiceIds: string[]; label: string };
          actions.push({ type: "approve", invoiceIds: inp.invoiceIds, label: inp.label });
          out = { ok: true, note: "Brugeren får en knap til at bekræfte." };
        } else out = { error: "Ukendt værktøj" };
        results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out) });
      } catch (e) {
        results.push({ type: "tool_result", tool_use_id: u.id, content: (e as Error).message, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { answer: "Jeg nåede ikke frem til et svar – prøv at omformulere spørgsmålet.", items: dedupe(items), actions, engine: "claude" };
}

function dedupe(items: AssistantItem[]) {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true))).slice(0, 25);
}

// ---------------------------------------------------------------------------
// Demo-motor (regelbaseret forståelse af danske spørgsmål)
// ---------------------------------------------------------------------------

const MONTHS = ["januar", "februar", "marts", "april", "maj", "juni", "juli", "august", "september", "oktober", "november", "december"];

function periodFromText(q: string): { from: string; to: string; label: string } | null {
  const today = todayISO();
  const y = Number(today.slice(0, 4));
  if (/i år|dette år|år til dato/.test(q)) return { from: `${y}-01-01`, to: today, label: "i år" };
  if (/sidste år|sidste år/.test(q)) return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: `i ${y - 1}` };
  if (/denne måned|måneden/.test(q)) return { from: today.slice(0, 8) + "01", to: today, label: "denne måned" };
  if (/sidste måned/.test(q)) {
    const d = new Date(today);
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    const from = d.toISOString().slice(0, 10);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    return { from, to: end, label: "sidste måned" };
  }
  const q3 = q.match(/(?:q|kvartal)\s?([1-4])/);
  if (q3) {
    const n = Number(q3[1]);
    const from = `${y}-${String((n - 1) * 3 + 1).padStart(2, "0")}-01`;
    const to = new Date(y, n * 3, 0).toISOString().slice(0, 10);
    return { from, to, label: `i Q${n}` };
  }
  const mi = MONTHS.findIndex((m) => q.includes(m));
  if (mi >= 0) {
    const from = `${y}-${String(mi + 1).padStart(2, "0")}-01`;
    const to = new Date(y, mi + 1, 0).toISOString().slice(0, 10);
    return { from, to, label: `i ${MONTHS[mi]}` };
  }
  const m = q.match(/sidste (\d+) (dage|måneder)/);
  if (m) {
    const n = Number(m[1]);
    return { from: addDays(today, -(m[2] === "dage" ? n : n * 30)), to: today, label: `de sidste ${n} ${m[2]}` };
  }
  return null;
}

function amountFromText(q: string) {
  const m = q.match(/(under|over|mindre end|mere end|højst|mindst)\s*([\d.]+(?:,\d+)?)\s*(k|t|tusind)?/);
  if (!m) return null;
  let n = Number(m[2]!.replace(/\./g, "").replace(",", "."));
  if (m[3]) n *= 1000;
  return /under|mindre|højst/.test(m[1]!) ? { max: n } : { min: n };
}

async function runDemo(ctx: Ctx, question: string): Promise<AssistantReply> {
  const q = question.toLowerCase().trim();
  const today = todayISO();
  const suppliers = await ctx.db.select({ name: schema.suppliers.name }).from(schema.suppliers).where(eq(schema.suppliers.companyId, ctx.companyId));
  const properties = await ctx.db.select({ name: schema.properties.name, address: schema.properties.address }).from(schema.properties).where(eq(schema.properties.companyId, ctx.companyId));
  const supplierHit = suppliers.find((s) => q.includes(s.name.toLowerCase().split(" ")[0]!));
  const propertyHit = properties.find((p) => q.includes(p.name.toLowerCase().split(" ")[0]!) || (p.address && q.includes(p.address.toLowerCase().split(" ")[0]!)));
  const amount = amountFromText(q);

  // Godkend alle ...
  if (/godkend/.test(q)) {
    const items = await searchInvoices(ctx, {
      onlyMine: true,
      statuses: ["pending_approval"],
      text: supplierHit?.name.split(" ")[0] ?? null,
      minAmount: amount?.min ?? null,
      maxAmount: amount?.max ?? null,
      limit: 50,
    });
    if (!items.length) return { answer: "Der er ingen fakturaer, der venter på din godkendelse og matcher det.", engine: "demo" };
    const total = items.reduce((s, i) => s + (i.amount ?? 0), 0);
    return {
      answer: `Jeg fandt **${items.length}** ${items.length === 1 ? "faktura" : "fakturaer"} til din godkendelse (i alt ${formatMoney(total)}). Tjek listen og bekræft herunder.`,
      items,
      actions: [{ type: "approve", invoiceIds: items.map((i) => i.id), label: `Godkend ${items.length} ${items.length === 1 ? "faktura" : "fakturaer"}` }],
      engine: "demo",
    };
  }

  // Forfalder ...
  if (/forfald|skal betales|betale|denne uge|næste uge|i morgen|i dag/.test(q) && !/brugt|udgift/.test(q)) {
    let from = today;
    let to = addDays(today, 7);
    let label = "de næste 7 dage";
    if (/i dag/.test(q)) {
      to = today;
      label = "i dag";
    } else if (/i morgen/.test(q)) {
      from = addDays(today, 1);
      to = from;
      label = "i morgen";
    } else if (/næste uge/.test(q)) {
      from = addDays(today, 7);
      to = addDays(today, 14);
      label = "i næste uge";
    } else if (/måned/.test(q)) {
      to = addDays(today, 30);
      label = "de næste 30 dage";
    }
    const overdue = /over|forfaldne|for sent|overskredet/.test(q);
    const items = await searchInvoices(ctx, {
      statuses: ["review", "pending_approval", "approved", "scheduled"],
      dueFrom: overdue ? null : from,
      dueTo: overdue ? addDays(today, -1) : to,
      text: supplierHit?.name.split(" ")[0] ?? null,
      limit: 50,
    });
    const total = items.reduce((s, i) => s + (i.amount ?? 0), 0);
    const notApproved = items.filter((i) => ["review", "pending_approval"].includes(i.status)).length;
    return {
      answer: items.length
        ? `${overdue ? "Der er" : `Der forfalder`} **${items.length}** ${items.length === 1 ? "faktura" : "fakturaer"} ${overdue ? "over forfald" : label} på i alt **${formatMoney(total)}**.${
            notApproved ? ` ${notApproved} af dem er endnu ikke godkendt.` : " Alle er godkendt og planlagt til betaling."
          }`
        : `Der forfalder ingen fakturaer ${label}. 🎉`,
      items,
      actions: notApproved ? [{ type: "navigate", href: "/app/approvals", label: "Gå til godkendelser" }] : [{ type: "navigate", href: "/app/payments", label: "Se betalinger" }],
      engine: "demo",
    };
  }

  // Forbrug / udgifter
  if (/brugt|udgift|forbrug|koste|kostet|hvor meget|spend|top|største/.test(q)) {
    const period = periodFromText(q) ?? { from: addDays(today, -365), to: today, label: "de sidste 12 måneder" };
    const groupBy = /leverandør|største|top/.test(q) && !supplierHit ? "supplier" : propertyHit || /ejendom/.test(q) ? "property" : /konto|kategori/.test(q) ? "account" : supplierHit ? "month" : "supplier";
    const filter = supplierHit?.name ?? propertyHit?.name ?? (/(el|strøm)\b/.test(q) ? "el" : /vand/.test(q) ? "vand" : /varme/.test(q) ? "varme" : /rengøring/.test(q) ? "rengøring" : null);
    const s = await spendSummary(ctx, { groupBy, from: period.from, to: period.to, filter });
    const top = s.rows.slice(0, 6);
    const subject = filter ? ` på ${filter}` : "";
    return {
      answer:
        s.total > 0
          ? `Udgifter${subject} ${period.label}: **${formatMoney(s.total)}** ekskl. moms.\n\n${top.map((r) => `• ${r.key}: ${formatMoney(r.amount)}`).join("\n")}`
          : `Jeg fandt ingen bogførte udgifter${subject} ${period.label}.`,
      actions: [{ type: "navigate", href: "/app/reports", label: "Åbn rapporter" }],
      engine: "demo",
    };
  }

  // Likviditet
  if (/saldo|likviditet|råd|penge|bank|cash/.test(q)) {
    const f = await forecast(ctx.db, ctx.companyId, 30);
    const o = await overview(ctx);
    return {
      answer: `Banksaldoen er **${formatMoney(o.balance)}**. Med de planlagte og forventede betalinger er den laveste saldo de næste 30 dage **${formatMoney(f.lowest.balance)}** (${formatDate(
        f.lowest.date,
      )}).${f.lowest.balance < 0 ? " ⚠️ Der er risiko for overtræk – overvej at udskyde betalinger." : " Der er god luft."}`,
      actions: [{ type: "navigate", href: "/app/cashflow", label: "Se likviditetsprognose" }],
      engine: "demo",
    };
  }

  // Advarsler / svindel / dubletter
  if (/svindel|dublet|advarsel|mistænkelig|risiko|konto.*ændret/.test(q)) {
    const rows = await ctx.db
      .select()
      .from(schema.invoices)
      .where(and(eq(schema.invoices.companyId, ctx.companyId), inArray(schema.invoices.status, ["review", "pending_approval", "approved"])))
      .orderBy(desc(schema.invoices.createdAt));
    const flagged = rows.filter((r) => r.flags.some((f) => !f.dismissed && f.severity !== "info"));
    return {
      answer: flagged.length
        ? `**${flagged.length}** ${flagged.length === 1 ? "faktura har" : "fakturaer har"} advarsler:\n\n${flagged
            .slice(0, 8)
            .map((r) => `• ${r.supplierName}: ${r.flags.filter((f) => !f.dismissed && f.severity !== "info").map((f) => f.message.split(".")[0]).join("; ")}`)
            .join("\n")}`
        : "Ingen åbne fakturaer har advarsler. 👍",
      items: flagged.map((r) => ({ id: r.id, supplier: r.supplierName ?? "Ukendt", number: r.invoiceNumber, amount: r.totalAmount, dueDate: r.dueDate, status: r.status })),
      engine: "demo",
    };
  }

  // Status / venter
  if (/venter|mangler|min[e]? godkendelse|til mig|status/.test(q)) {
    const items = await searchInvoices(ctx, { onlyMine: true, statuses: ["pending_approval"], limit: 50 });
    return {
      answer: items.length ? `**${items.length}** ${items.length === 1 ? "faktura venter" : "fakturaer venter"} på din godkendelse.` : "Intet venter på dig lige nu.",
      items,
      actions: items.length ? [{ type: "navigate", href: "/app/approvals", label: "Åbn godkendelser" }] : [],
      engine: "demo",
    };
  }

  // Fritekstsøgning
  const words = q.replace(/\b(find|vis|søg|efter|faktura(?:en|er)?|fra|alle|mig|de|den|det)\b/g, " ").trim();
  const items = await searchInvoices(ctx, { text: supplierHit?.name.split(" ")[0] ?? (words || null), limit: 20 });
  if (items.length) {
    return {
      answer: `Jeg fandt ${items.length} ${items.length === 1 ? "resultat" : "resultater"} for "${question}".`,
      items: items.map((i) => ({ ...i, status: STATUS[i.status as keyof typeof STATUS]?.label ?? i.status })),
      engine: "demo",
    };
  }
  return {
    answer:
      'Det forstod jeg ikke helt. Prøv fx:\n• "Hvad forfalder i denne uge?"\n• "Godkend alle fra Lysgaard under 5.000"\n• "Hvor meget har vi brugt på Fælledvej i år?"\n• "Hvordan ser likviditeten ud?"\n• "Er der mistænkelige fakturaer?"',
    engine: "demo",
  };
}

export async function askAssistant(ctx: Ctx & { companyName: string }, question: string): Promise<AssistantReply> {
  const integ = await getIntegration(ctx.db, ctx.companyId, "ai");
  const key = integ?.config.apiKey ? decrypt(integ.config.apiKey) : process.env.ANTHROPIC_API_KEY;
  if (key && process.env.AI_PROVIDER !== "demo") {
    try {
      return await runClaude(ctx, key, question, ctx.companyName);
    } catch (e) {
      const r = await runDemo(ctx, question);
      return { ...r, answer: `${r.answer}\n\n_(Claude var ikke tilgængelig: ${(e as Error).message.slice(0, 80)})_` };
    }
  }
  return runDemo(ctx, question);
}
