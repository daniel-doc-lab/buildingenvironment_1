import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Clock, X, CircleDot, Sparkles, Download, FileText, Building2, History } from "lucide-react";
import { requireCompany, can } from "@/server/auth";
import { invoiceDetail } from "@/server/queries";
import { Badge, Card, CardHeader, Avatar } from "@/components/ui";
import { InvoiceEditor } from "./invoice-editor";
import { Comments } from "./comments";
import { FlagList } from "./flag-list";
import { STATUS, SOURCE_LABEL, PAYMENT_STATUS, AUDIT_LABEL } from "@/lib/labels";
import { cn, formatDate, formatDateTime, formatMoney } from "@/lib/utils";

export async function generateMetadata(props: PageProps<"/app/invoices/[id]">): Promise<Metadata> {
  void props;
  return { title: "Faktura" };
}

export default async function InvoicePage(props: PageProps<"/app/invoices/[id]">) {
  const { id } = await props.params;
  const ctx = await requireCompany();
  const d = await invoiceDetail(ctx.db, ctx.company.id, id);
  if (!d) notFound();
  const { inv } = d;
  const st = STATUS[inv.status];
  const myPending = d.approvals.some((a) => a.a.userId === ctx.user.id && a.a.status === "pending");
  const canEdit = can(ctx.role, "editInvoices") && ["review", "rejected", "pending_approval", "processing"].includes(inv.status);
  const steps = [...new Set(d.approvals.map((a) => a.a.stepIndex))].map((i) => ({
    index: i,
    name: d.approvals.find((a) => a.a.stepIndex === i)!.a.stepName,
    rows: d.approvals.filter((a) => a.a.stepIndex === i),
  }));
  const conf = inv.extraction?.confidence ?? {};

  return (
    <div className="animate-in">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href="/app/inbox" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
            ← Indbakke
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{inv.supplierName ?? "Ukendt leverandør"}</h1>
            <Badge tone={st.tone} dot>
              {st.label}
            </Badge>
            {inv.kind === "credit_note" ? <Badge tone="info">Kreditnota</Badge> : null}
            {inv.kind === "expense" ? <Badge>Udlæg</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-muted">
            {inv.invoiceNumber ? `Faktura ${inv.invoiceNumber} · ` : ""}
            Modtaget via {SOURCE_LABEL[inv.source] ?? inv.source} {formatDateTime(inv.createdAt)}
            {inv.externalVoucher ? ` · Bilag ${inv.externalVoucher} i regnskabet` : ""}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-3xl font-semibold tracking-tight tabular">
            {inv.kind === "credit_note" ? "−" : ""}
            {formatMoney(inv.totalAmount, inv.currency)}
          </p>
          <p className="text-sm text-muted">{inv.dueDate ? `Forfalder ${formatDate(inv.dueDate)}` : "Ingen forfaldsdato"}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {/* Dokument */}
        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-sm">
              <span className="flex min-w-0 items-center gap-2 text-muted">
                <FileText className="h-4 w-4 shrink-0" />
                <span className="truncate">{d.file?.name ?? "Intet dokument"}</span>
              </span>
              {d.file ? (
                <a href={`/api/files/${d.file.id}?download`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
                  <Download className="h-3.5 w-3.5" /> Hent
                </a>
              ) : null}
            </div>
            {d.file ? (
              d.file.mime === "application/pdf" ? (
                <iframe src={`/api/files/${d.file.id}#toolbar=0&navpanes=0&view=FitH`} title="Faktura" className="h-[70vh] min-h-[480px] w-full bg-surface-2" />
              ) : d.file.mime.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/files/${d.file.id}`} alt="Faktura" className="max-h-[75vh] w-full object-contain bg-surface-2" />
              ) : (
                <div className="max-h-[70vh] overflow-auto bg-surface-2 p-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Badge tone="brand">E-faktura</Badge> Struktureret OIOUBL/Peppol-dokument – data er læst 100 % præcist.
                  </p>
                  <iframe src={`/api/files/${d.file.id}`} title="XML" className="h-[60vh] w-full rounded-lg border border-line bg-surface" />
                </div>
              )
            ) : (
              <p className="p-10 text-center text-sm text-muted">Ingen fil tilknyttet</p>
            )}
          </Card>
          {inv.extraction ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2.5 text-xs text-muted">
              <Sparkles className="h-3.5 w-3.5 text-brand" />
              Læst af {inv.extraction.provider === "claude" ? `Claude (${inv.extraction.model})` : inv.extraction.provider === "ubl" ? "e-fakturaparser" : "Demo-AI"}
              {inv.extraction.durationMs ? ` på ${(inv.extraction.durationMs / 1000).toFixed(1)} s` : ""}
              <span className="flex-1" />
              {Object.entries(conf).map(([k, v]) => (
                <span key={k} className={cn("rounded-full px-2 py-0.5", (v ?? 1) >= 0.8 ? "bg-success-soft text-success" : (v ?? 1) >= 0.6 ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger")}>
                  {{ supplier: "Leverandør", invoiceNumber: "Nr.", dates: "Datoer", amounts: "Beløb", payment: "Betaling" }[k] ?? k} {Math.round((v ?? 0) * 100)}%
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Data og handlinger */}
        <div className="space-y-5">
          {inv.flags.length ? <FlagList invoiceId={inv.id} flags={inv.flags} canEdit={can(ctx.role, "editInvoices")} /> : null}

          {inv.description ? (
            <div className="flex items-start gap-2 rounded-xl bg-brand-soft/60 px-4 py-3 text-sm text-brand-ink">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{inv.description}</span>
            </div>
          ) : null}

          <InvoiceEditor
            invoice={{
              id: inv.id,
              status: inv.status,
              kind: inv.kind,
              supplierId: inv.supplierId,
              supplierName: inv.supplierName,
              supplierCvr: inv.supplierCvr,
              invoiceNumber: inv.invoiceNumber,
              issueDate: inv.issueDate,
              dueDate: inv.dueDate,
              currency: inv.currency,
              amountExVat: inv.amountExVat,
              vatAmount: inv.vatAmount,
              totalAmount: inv.totalAmount,
              paymentMethod: inv.paymentMethod,
              fikType: inv.fikType,
              fikCreditor: inv.fikCreditor,
              fikPaymentId: inv.fikPaymentId,
              bankReg: inv.bankReg,
              bankAccount: inv.bankAccount,
              iban: inv.iban,
              bic: inv.bic,
              paymentMessage: inv.paymentMessage,
              propertyId: inv.propertyId,
              unitId: inv.unitId,
              departmentCode: inv.departmentCode,
              discountDate: inv.discountDate,
              discountAmount: inv.discountAmount,
            }}
            lines={d.lines.map((l) => ({
              id: l.id,
              description: l.description,
              quantity: l.quantity,
              amount: l.amount,
              vatCode: l.vatCode,
              accountNumber: l.accountNumber,
              departmentCode: l.departmentCode,
              propertyId: l.propertyId,
              unitId: l.unitId,
              aiSuggested: l.aiSuggested,
              aiConfidence: l.aiConfidence,
              aiReason: l.aiReason,
            }))}
            options={{
              accounts: d.accounts.filter((a) => a.type === "expense").map((a) => ({ value: a.number, label: `${a.number} ${a.name}` })),
              vatCodes: d.vatCodes.map((v) => ({ value: v.code, label: `${v.code} – ${v.name}`, rate: v.rate })),
              properties: d.properties.map((p) => ({ value: p.id, label: p.name })),
              units: d.units.map((u) => ({ value: u.id, label: `${u.name}${u.tenantName ? ` (${u.tenantName})` : ""}`, propertyId: u.propertyId })),
              departments: d.departments.map((x) => ({ value: x.code, label: x.name })),
              suppliers: d.suppliers.map((s) => ({ value: s.id, label: s.name })),
            }}
            perms={{
              canEdit,
              canApprove: myPending,
              canPay: can(ctx.role, "pay") && ["approved", "scheduled"].includes(inv.status),
              canDelete: can(ctx.role, "editInvoices") && ["review", "rejected", "processing"].includes(inv.status),
              canSubmit: can(ctx.role, "editInvoices") && ["review", "rejected"].includes(inv.status),
            }}
            propertyModule={!!ctx.company.settings.propertyModule}
          />

          {steps.length ? (
            <Card>
              <CardHeader title="Godkendelse" description={inv.status === "pending_approval" ? "Fakturaen følger godkendelsesflowet nedenfor" : undefined} />
              <ol className="space-y-0 px-5 py-4">
                {steps.map((s, i) => {
                  const approved = s.rows.some((r) => r.a.status === "approved");
                  const rejected = s.rows.some((r) => r.a.status === "rejected");
                  const active = s.rows.some((r) => r.a.status === "pending");
                  return (
                    <li key={s.index} className="relative flex gap-3 pb-5 last:pb-0">
                      {i < steps.length - 1 ? <span className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-px bg-line" /> : null}
                      <span
                        className={cn(
                          "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                          approved ? "bg-success text-white" : rejected ? "bg-danger text-white" : active ? "bg-info-soft text-info ring-4 ring-info-soft" : "bg-surface-2 text-muted",
                        )}
                      >
                        {approved ? <Check className="h-4 w-4" /> : rejected ? <X className="h-4 w-4" /> : active ? <Clock className="h-4 w-4" /> : <CircleDot className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <p className="text-sm font-medium">{s.name}</p>
                        <ul className="mt-1 space-y-1">
                          {s.rows.map((r) => (
                            <li key={r.a.id} className="flex flex-wrap items-center gap-2 text-sm">
                              <Avatar name={r.name} className="h-5 w-5 text-[9px]" />
                              <span>{r.name}</span>
                              {r.a.delegatedFrom ? <Badge>Stedfortræder</Badge> : null}
                              <span className="text-xs text-muted">
                                {r.a.status === "approved"
                                  ? `godkendte ${formatDateTime(r.a.decidedAt)}`
                                  : r.a.status === "rejected"
                                    ? `afviste ${formatDateTime(r.a.decidedAt)}`
                                    : r.a.status === "pending"
                                      ? "afventer"
                                      : r.a.status === "skipped"
                                        ? "ikke nødvendig"
                                        : "venter på forrige trin"}
                              </span>
                              {r.a.comment ? <span className="w-full pl-7 text-xs italic text-muted">“{r.a.comment}”</span> : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          ) : null}

          {d.payments.length ? (
            <Card>
              <CardHeader title="Betaling" />
              <ul className="divide-y divide-line">
                {d.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <Badge tone={PAYMENT_STATUS[p.status]?.tone}>{PAYMENT_STATUS[p.status]?.label}</Badge>
                    <span className="flex-1">
                      {formatMoney(p.amount)} {p.status === "executed" ? "betalt" : "planlagt til"} {formatDate(p.executedAt ?? p.executionDate)}
                    </span>
                    {p.batchId ? (
                      <Link href={`/app/payments/batches/${p.batchId}`} className="text-xs text-brand hover:underline">
                        Se batch →
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {d.supplier ? (
            <Card>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted" /> {d.supplier.name}
                  </span>
                }
                description={[d.supplier.cvr ? `CVR ${d.supplier.cvr}` : null, d.supplier.industry].filter(Boolean).join(" · ")}
                action={
                  <Link href={`/app/suppliers/${d.supplier.id}`} className="text-xs text-brand hover:underline">
                    Leverandørkort →
                  </Link>
                }
              />
              {d.history.length ? (
                <ul className="divide-y divide-line">
                  {d.history.map((h) => (
                    <li key={h.id}>
                      <Link href={`/app/invoices/${h.id}`} className="flex items-center gap-3 px-5 py-2 text-sm hover:bg-surface-2">
                        <History className="h-3.5 w-3.5 text-muted" />
                        <span className="flex-1 text-muted">
                          {formatDate(h.issueDate)} · {h.invoiceNumber}
                        </span>
                        <Badge tone={STATUS[h.status].tone}>{STATUS[h.status].label}</Badge>
                        <span className="w-28 text-right tabular">{formatMoney(h.totalAmount)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-4 text-sm text-muted">Første faktura fra leverandøren.</p>
              )}
            </Card>
          ) : null}

          <Comments
            invoiceId={inv.id}
            comments={d.comments.map((c) => ({ id: c.c.id, body: c.c.body, name: c.name ?? "Fluks", createdAt: c.c.createdAt.toISOString() }))}
            members={d.members.map((m) => m.name.split(" ")[0]!)}
          />

          <details className="rounded-2xl border border-line bg-surface">
            <summary className="cursor-pointer px-5 py-3 text-sm font-medium">Revisionsspor ({d.trail.length})</summary>
            <ul className="border-t border-line px-5 py-3 text-xs">
              {d.trail.map((t) => (
                <li key={t.log.id} className="flex gap-3 py-1">
                  <span className="w-36 shrink-0 text-muted">{formatDateTime(t.log.createdAt)}</span>
                  <span>
                    <span className="font-medium">{t.name ?? "Fluks"}</span> {AUDIT_LABEL[t.log.action] ?? t.log.action}
                    {t.log.data && Object.keys(t.log.data).length ? <span className="text-muted"> · {Object.values(t.log.data).filter((v) => typeof v === "string").join(", ")}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}
