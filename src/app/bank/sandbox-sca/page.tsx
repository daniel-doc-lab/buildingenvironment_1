import { and, eq } from "drizzle-orm";
import { schema } from "@/db";
import { getContext } from "@/server/auth";
import { formatMoney } from "@/lib/utils";
import { MitIdBox } from "../mitid-box";

export default async function SandboxSca(props: PageProps<"/bank/sandbox-sca">) {
  const sp = await props.searchParams;
  const state = String(sp.state ?? "");
  const redirect = String(sp.redirect ?? "/api/bank/callback");
  const target = new URL(redirect, "http://x");
  const batchId = state.split(":")[1] ?? "";
  const ctx = await getContext();
  const batch = ctx?.company
    ? await ctx.db.query.paymentBatches.findFirst({ where: and(eq(schema.paymentBatches.id, batchId), eq(schema.paymentBatches.companyId, ctx.company.id)) })
    : null;
  const account = batch?.bankAccountId ? await ctx!.db.query.bankAccounts.findFirst({ where: eq(schema.bankAccounts.id, batch.bankAccountId) }) : null;
  return (
    <MitIdBox
      bank={account?.bankName ?? "Banken"}
      title="Godkend betalinger"
      lines={[
        batch ? `${batch.count} betalinger i alt ${formatMoney(batch.totalAmount)}` : "Betalinger fra Fluks",
        account ? `Fra ${account.name} (${account.reg} ${account.account})` : "Fra din erhvervskonto",
        "Betalingerne gennemføres på de angivne datoer",
      ]}
      approveLabel="Godkend betalinger"
      approveHref={`${target.pathname}?state=${encodeURIComponent(state)}&code=ok`}
      cancelHref={`${target.pathname}?state=${encodeURIComponent(state)}&error=cancelled`}
    />
  );
}
