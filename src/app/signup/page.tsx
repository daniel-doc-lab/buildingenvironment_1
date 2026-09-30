import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Opret konto" };

export default async function SignupPage(props: PageProps<"/signup">) {
  const sp = await props.searchParams;
  const invite = typeof sp.invite === "string" ? sp.invite : undefined;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6">
      <Link href="/" className="mb-8">
        <Logo />
      </Link>
      <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-8 shadow-card">
        <h1 className="text-2xl font-semibold tracking-tight">{invite ? "Acceptér invitation" : "Kom i gang på 2 minutter"}</h1>
        <p className="mt-1 text-sm text-muted">
          {invite ? "Opret din bruger for at tilgå virksomheden." : "Gratis i 30 dage. Intet kreditkort. Opsig når som helst."}
        </p>
        <SignupForm invite={invite} />
      </div>
      <p className="mt-6 text-sm text-muted">
        Har du allerede en konto?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Log ind
        </Link>
      </p>
    </div>
  );
}
