import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  ExtractionSchema,
  CodingSchema,
  type AIProvider,
  type CodingContext,
  type CodingSuggestion,
  type ExtractInput,
  type Extraction,
} from "./types";

export const CLAUDE_MODEL = process.env.AI_MODEL ?? "claude-opus-5-5";

const EXTRACTION_SYSTEM = `Du er en ekspert i danske leverandørfakturaer og bogføring.
Du udtrækker data fra fakturaer, kreditnotaer og kvitteringer præcist og returnerer dem struktureret.

Regler:
- Beløb angives i hovedvaluta som tal (1.234,50 kr. -> 1234.5). Danske tal bruger punktum som tusindtalsseparator og komma som decimal.
- Datoer returneres som YYYY-MM-DD. Hvis kun betalingsbetingelser er angivet (fx "netto 30 dage"), beregn forfaldsdatoen ud fra fakturadatoen.
- Leverandøren er afsenderen af fakturaen – aldrig modtageren. Modtageren er typisk kunden der er nævnt i opgaven.
- FI-kort / indbetalingskort skrives som "+71<betalings-id+kreditornr<" (også +73 og +75). Gengiv kodelinjen præcist.
- Hvis fakturaen betales via Betalingsservice/PBS eller allerede er betalt med kort, angiv paymentMethod tilsvarende.
- Angiv en leverings- eller arbejdsadresse hvis den adskiller sig fra kundens adresse (relevant for ejendomme).
- confidence er et tal mellem 0 og 1 per område. Sæt lav værdi hvis teksten er utydelig eller du gætter.
- Hvis et felt ikke findes, returnér null. Opfind aldrig data.`;

export class ClaudeProvider implements AIProvider {
  readonly name = "claude" as const;
  readonly model = CLAUDE_MODEL;
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic(apiKey ? { apiKey } : undefined);
  }

  async extract(input: ExtractInput): Promise<Extraction> {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    const b64 = input.bytes.toString("base64");
    if (input.mime === "application/pdf") {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } });
    } else if (/^image\/(png|jpeg|gif|webp)$/.test(input.mime)) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: input.mime as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: b64 },
      });
    } else if (input.text) {
      content.push({ type: "text", text: `<dokument filnavn="${input.fileName}">\n${input.text}\n</dokument>` });
    }
    content.push({
      type: "text",
      text: `Modtageren (vores virksomhed) er ${input.companyName ?? "ukendt"}${
        input.companyCvr ? ` med CVR ${input.companyCvr}` : ""
      }. Udtræk fakturadata fra dokumentet.`,
    });

    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(ExtractionSchema) },
      system: EXTRACTION_SYSTEM,
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal") throw new Error("AI afviste at læse dokumentet");
    if (!response.parsed_output) throw new Error("AI returnerede ikke gyldige data");
    return response.parsed_output;
  }

  async suggestCoding(lines: { description: string; amount: number }[], ctx: CodingContext): Promise<CodingSuggestion[]> {
    if (lines.length === 0) return [];
    const system = `Du er en erfaren dansk bogholder. Du konterer leverandørfakturaer på virksomhedens kontoplan.
Vælg den mest passende udgiftskonto og momskode for hver linje. Brug virksomhedens historik for leverandøren som stærkeste signal.
Hvis fakturaen vedrører en af virksomhedens ejendomme (fx via leverings- eller arbejdsadresse), angiv ejendommens id.
Brug kun kontonumre, momskoder, ejendoms-id'er og afdelingskoder fra listerne. Returnér null hvis intet passer.`;
    const context = {
      kontoplan: ctx.accounts,
      momskoder: ctx.vatCodes,
      ejendomme: ctx.properties,
      afdelinger: ctx.departments,
      leverandoer: ctx.supplierName,
      branche: ctx.supplierIndustry,
      historik: ctx.history.slice(0, 30),
      leveringsadresse: ctx.deliveryAddress,
    };
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(CodingSchema) },
      system,
      messages: [
        {
          role: "user",
          content: `<kontekst>${JSON.stringify(context)}</kontekst>
<linjer>${JSON.stringify(lines.map((l, index) => ({ index, ...l })))}</linjer>
${ctx.documentText ? `<dokumenttekst>${ctx.documentText.slice(0, 6000)}</dokumenttekst>` : ""}`,
        },
      ],
    });
    const parsed = response.parsed_output;
    if (!parsed) return lines.map(() => empty());
    return lines.map((_, i) => {
      const s = parsed.lines.find((l) => l.index === i);
      if (!s) return empty();
      const validAccount = ctx.accounts.some((a) => a.number === s.accountNumber) ? s.accountNumber : null;
      const validVat = ctx.vatCodes.some((v) => v.code === s.vatCode) ? s.vatCode : null;
      const validProp = ctx.properties.some((p) => p.id === s.propertyId) ? s.propertyId : null;
      const validDept = ctx.departments.some((d) => d.code === s.departmentCode) ? s.departmentCode : null;
      return {
        accountNumber: validAccount,
        vatCode: validVat,
        propertyId: validProp,
        departmentCode: validDept,
        confidence: Math.max(0, Math.min(1, s.confidence)),
        reason: s.reason,
      };
    });
  }
}

function empty(): CodingSuggestion {
  return { accountNumber: null, vatCode: null, propertyId: null, departmentCode: null, confidence: 0, reason: "" };
}
