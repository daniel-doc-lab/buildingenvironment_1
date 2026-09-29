import type { DebtorAccount, PaymentInstruction } from "./types";

/**
 * Genererer ISO 20022 pain.001.001.03 (Customer Credit Transfer Initiation).
 * Filen kan importeres i danske netbanker (Danske Bank District, Nordea Business, Jyske Netbank Erhverv,
 * Bankdata/BEC-banker m.fl.) – virker uden PSD2-aftale.
 *
 * FI-kort mappes efter den fælles danske ISO 20022-praksis: kortarten angives som lokalt instrument,
 * kreditornummeret som modtagerkonto og betalings-id'et som struktureret reference.
 * Kontrollér altid mod din banks Message Implementation Guide før produktion.
 */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const amt = (ore: number) => (ore / 100).toFixed(2);
const clip = (s: string | null | undefined, n: number) => esc((s ?? "").slice(0, n));

export function buildPain001(opts: {
  messageId: string;
  initiatorName: string;
  initiatorCvr?: string | null;
  debtor: DebtorAccount;
  payments: PaymentInstruction[];
  createdAt?: Date;
}) {
  const created = (opts.createdAt ?? new Date()).toISOString().slice(0, 19);
  const total = opts.payments.reduce((s, p) => s + p.amount, 0);

  // Én PmtInf pr. eksekveringsdato + betalingstype
  const groups = new Map<string, PaymentInstruction[]>();
  for (const p of opts.payments) {
    const key = `${p.executionDate}|${p.method}|${p.fikType ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }

  const debtorAcct = opts.debtor.iban
    ? `<IBAN>${esc(opts.debtor.iban)}</IBAN>`
    : `<Othr><Id>${esc((opts.debtor.reg ?? "") + (opts.debtor.account ?? "").padStart(10, "0"))}</Id><SchmeNm><Cd>BBAN</Cd></SchmeNm></Othr>`;
  const debtorAgent = opts.debtor.bic
    ? `<FinInstnId><BIC>${esc(opts.debtor.bic)}</BIC></FinInstnId>`
    : `<FinInstnId><ClrSysMmbId><ClrSysId><Cd>DKNCC</Cd></ClrSysId><MmbId>${esc(opts.debtor.reg ?? "")}</MmbId></ClrSysMmbId></FinInstnId>`;

  let idx = 0;
  const pmtInfs = [...groups.entries()].map(([key, list]) => {
    const [date, method, fikType] = key.split("|");
    idx++;
    const sum = list.reduce((s, p) => s + p.amount, 0);
    const pmtTp =
      method === "fik"
        ? `<PmtTpInf><LclInstrm><Prtry>${esc(fikType || "71")}</Prtry></LclInstrm></PmtTpInf>`
        : method === "iban"
          ? `<PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>`
          : `<PmtTpInf><SvcLvl><Cd>NURG</Cd></SvcLvl></PmtTpInf>`;
    const txs = list
      .map((p) => {
        let creditorAcct = "";
        let creditorAgent = "";
        let rmt = "";
        if (p.method === "iban") {
          creditorAcct = `<CdtrAcct><Id><IBAN>${esc((p.iban ?? "").replace(/\s/g, ""))}</IBAN></Id></CdtrAcct>`;
          creditorAgent = p.bic ? `<CdtrAgt><FinInstnId><BIC>${esc(p.bic)}</BIC></FinInstnId></CdtrAgt>` : "";
          rmt = `<RmtInf><Ustrd>${clip(p.message ?? p.ownReference, 140)}</Ustrd></RmtInf>`;
        } else if (p.method === "domestic") {
          creditorAgent = `<CdtrAgt><FinInstnId><ClrSysMmbId><ClrSysId><Cd>DKNCC</Cd></ClrSysId><MmbId>${esc(p.bankReg ?? "")}</MmbId></ClrSysMmbId></FinInstnId></CdtrAgt>`;
          creditorAcct = `<CdtrAcct><Id><Othr><Id>${esc((p.bankReg ?? "") + (p.bankAccount ?? "").padStart(10, "0"))}</Id><SchmeNm><Cd>BBAN</Cd></SchmeNm></Othr></Id></CdtrAcct>`;
          rmt = `<RmtInf><Ustrd>${clip(p.message ?? p.ownReference, 140)}</Ustrd></RmtInf>`;
        } else {
          creditorAcct = `<CdtrAcct><Id><Othr><Id>${esc(p.fikCreditor ?? "")}</Id><SchmeNm><Prtry>FIK</Prtry></SchmeNm></Othr></Id></CdtrAcct>`;
          rmt = p.fikPaymentId
            ? `<RmtInf><Strd><CdtrRefInf><Tp><CdOrPrtry><Cd>SCOR</Cd></CdOrPrtry></Tp><Ref>${esc(p.fikPaymentId)}</Ref></CdtrRefInf></Strd></RmtInf>`
            : `<RmtInf><Ustrd>${clip(p.message ?? p.ownReference, 41)}</Ustrd></RmtInf>`;
        }
        return `<CdtTrfTxInf><PmtId><InstrId>${esc(p.id.slice(0, 35))}</InstrId><EndToEndId>${esc(
          (p.ownReference ?? p.id).slice(0, 35),
        )}</EndToEndId></PmtId><Amt><InstdAmt Ccy="${esc(p.currency)}">${amt(p.amount)}</InstdAmt></Amt>${creditorAgent}<Cdtr><Nm>${clip(
          p.creditorName,
          70,
        )}</Nm></Cdtr>${creditorAcct}${rmt}</CdtTrfTxInf>`;
      })
      .join("");
    return `<PmtInf><PmtInfId>${esc(`${opts.messageId}-${idx}`.slice(0, 35))}</PmtInfId><PmtMtd>TRF</PmtMtd><BtchBookg>false</BtchBookg><NbOfTxs>${
      list.length
    }</NbOfTxs><CtrlSum>${amt(sum)}</CtrlSum>${pmtTp}<ReqdExctnDt>${date}</ReqdExctnDt><Dbtr><Nm>${clip(
      opts.debtor.name,
      70,
    )}</Nm></Dbtr><DbtrAcct><Id>${debtorAcct}</Id><Ccy>DKK</Ccy></DbtrAcct><DbtrAgt>${debtorAgent}</DbtrAgt><ChrgBr>SLEV</ChrgBr>${txs}</PmtInf>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><CstmrCdtTrfInitn><GrpHdr><MsgId>${esc(
    opts.messageId.slice(0, 35),
  )}</MsgId><CreDtTm>${created}</CreDtTm><NbOfTxs>${opts.payments.length}</NbOfTxs><CtrlSum>${amt(total)}</CtrlSum><InitgPty><Nm>${clip(
    opts.initiatorName,
    70,
  )}</Nm>${
    opts.initiatorCvr ? `<Id><OrgId><Othr><Id>${esc(opts.initiatorCvr)}</Id><SchmeNm><Cd>CUST</Cd></SchmeNm></Othr></OrgId></Id>` : ""
  }</InitgPty></GrpHdr>${pmtInfs.join("")}</CstmrCdtTrfInitn></Document>
`;
}
