import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo />
      <h1 className="text-2xl font-semibold">Siden findes ikke</h1>
      <p className="text-sm text-muted">Den er måske flyttet eller slettet.</p>
      <Link href="/app" className="rounded-[10px] bg-brand px-4 py-2 text-sm font-medium text-white">
        Til overblikket
      </Link>
    </div>
  );
}
