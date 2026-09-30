import "server-only";
import { and, eq } from "drizzle-orm";
import type { DB } from "@/db";
import { schema } from "@/db";
import { sha256 } from "@/lib/crypto";

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const ACCEPTED_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif", "application/xml", "text/xml"];

export function guessMime(name: string, mime?: string | null) {
  if (mime && mime !== "application/octet-stream") return mime;
  const ext = name.toLowerCase().split(".").pop();
  return (
    { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", xml: "application/xml", gif: "image/gif" }[
      ext ?? ""
    ] ?? "application/octet-stream"
  );
}

export async function storeFile(db: DB, companyId: string, file: { name: string; mime: string; data: Buffer }) {
  if (file.data.length > MAX_FILE_BYTES) throw new Error("Filen er for stor (maks 15 MB)");
  const hash = sha256(file.data);
  const existing = await db.query.files.findFirst({
    where: and(eq(schema.files.companyId, companyId), eq(schema.files.sha256, hash)),
    columns: { id: true },
  });
  const [row] = await db
    .insert(schema.files)
    .values({ companyId, name: file.name.slice(0, 200), mime: file.mime, size: file.data.length, sha256: hash, data: file.data })
    .returning({ id: schema.files.id });
  return { id: row!.id, sha256: hash, duplicateFileId: existing?.id ?? null };
}
