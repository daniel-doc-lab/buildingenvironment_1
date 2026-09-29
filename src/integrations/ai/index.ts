import "server-only";
import { ClaudeProvider } from "./claude";
import { DemoProvider } from "./demo";
import type { AIProvider } from "./types";

export * from "./types";

/** Vælger AI-motor: Claude hvis der findes en API-nøgle (virksomhedens eller miljøets), ellers demo-motoren. */
export function getAI(companyApiKey?: string | null): AIProvider {
  const key = companyApiKey || process.env.ANTHROPIC_API_KEY;
  if (key && process.env.AI_PROVIDER !== "demo") return new ClaudeProvider(key);
  return new DemoProvider();
}

export function aiStatus(companyApiKey?: string | null) {
  const key = companyApiKey || process.env.ANTHROPIC_API_KEY;
  const live = !!key && process.env.AI_PROVIDER !== "demo";
  return { live, label: live ? "Claude" : "Demo-AI", model: live ? new ClaudeProvider(key).model : null };
}

/** Udtrækker tekst fra PDF (bruges af demo-motoren og til søgning). */
export async function pdfText(bytes: Buffer): Promise<string> {
  try {
    const { getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const pages: string[] = [];
    for (let p = 1; p <= Math.min(pdf.numPages, 10); p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      // Genopbyg linjer ud fra y-koordinat, så tabeller og etiketter bevares
      const rows = new Map<number, { x: number; s: string }[]>();
      for (const item of content.items as { str?: string; transform?: number[] }[]) {
        if (!item.str || !item.transform) continue;
        const y = Math.round(item.transform[5]! / 2) * 2;
        const x = item.transform[4]!;
        const row = rows.get(y) ?? [];
        row.push({ x, s: item.str });
        rows.set(y, row);
      }
      const lines = [...rows.entries()]
        .sort((a, b) => b[0] - a[0])
        .map(([, parts]) =>
          parts
            .sort((a, b) => a.x - b.x)
            .map((p) => p.s)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim(),
        )
        .filter(Boolean);
      pages.push(lines.join("\n"));
    }
    return pages.join("\n");
  } catch {
    return "";
  }
}
