import { NextResponse } from "next/server";
import { getContext } from "@/server/auth";
import { askAssistant } from "@/server/services/assistant";

export async function POST(req: Request) {
  const ctx = await getContext();
  if (!ctx?.company) return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
  const { question } = (await req.json().catch(() => ({}))) as { question?: string };
  if (!question?.trim()) return NextResponse.json({ error: "Tomt spørgsmål" }, { status: 400 });
  const reply = await askAssistant({ db: ctx.db, companyId: ctx.company.id, userId: ctx.user.id, companyName: ctx.company.name }, question.slice(0, 1000));
  return NextResponse.json(reply);
}
