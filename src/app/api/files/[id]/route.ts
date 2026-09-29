import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getContext } from "@/server/auth";
import { schema } from "@/db";

export async function GET(req: Request, ctx: RouteContext<"/api/files/[id]">) {
  const { id } = await ctx.params;
  const auth = await getContext();
  if (!auth?.company) return new NextResponse("Ikke logget ind", { status: 401 });
  const companyIds = auth.companies.map((c) => c.id);
  const file = await auth.db.query.files.findFirst({ where: eq(schema.files.id, id) });
  if (!file || !companyIds.includes(file.companyId)) return new NextResponse("Ikke fundet", { status: 404 });
  void and;
  const download = new URL(req.url).searchParams.has("download");
  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.size),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
