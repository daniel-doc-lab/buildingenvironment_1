import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";
import { demoLoginAction } from "../auth-actions";
import { DEMO_USERS } from "@/server/demo/catalog";
import { ROLE_LABELS } from "@/server/auth";

export const metadata: Metadata = { title: "Log ind" };

export default async function LoginPage(props: PageProps<"/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : "/app";
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-between p-6 sm:p-10">
        <Link href="/">
          <Logo />
        </Link>
        <div className="mx-auto w-full max-w-sm py-10">
          <h1 className="text-2xl font-semibold tracking-tight">Velkommen tilbage</h1>
          <p className="mt-1 text-sm text-muted">Log ind for at godkende og betale fakturaer.</p>
          <LoginForm next={next} />
          <p className="mt-6 text-center text-sm text-muted">
            Ny hos Fluks?{" "}
            <Link href="/signup" className="font-medium text-brand hover:underline">
              Opret gratis konto
            </Link>
          </p>
          <div className="mt-8 rounded-2xl border border-dashed border-line-strong bg-surface p-4">
            <p className="text-sm font-medium">Prøv demoen uden at oprette konto</p>
            <p className="mt-0.5 text-xs text-muted">Log ind som en af brugerne i demovirksomheden Nordlys Ejendomme ApS.</p>
            <div className="mt-3 grid gap-2">
              {DEMO_USERS.slice(0, 4).map((u) => (
                <form key={u.email} action={demoLoginAction}>
                  <input type="hidden" name="as" value={u.email} />
                  <button className="flex w-full items-center justify-between rounded-xl border border-line bg-surface px-3 py-2 text-left text-sm transition hover:border-brand hover:bg-brand-soft/40">
                    <span>
                      <span className="font-medium">{u.name}</span>
                      <span className="text-muted"> · {u.title}</span>
                    </span>
                    <span className="text-xs text-muted">{ROLE_LABELS[u.role]}</span>
                  </button>
                </form>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs text-muted">© {new Date().getFullYear()} Fluks · Data opbevares i EU</p>
      </div>
      <div className="relative hidden overflow-hidden bg-brand lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(200,241,105,0.35),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,0.12),transparent_40%)]" />
        <div className="relative flex h-full flex-col justify-end p-12 text-white">
          <p className="max-w-md text-3xl font-semibold leading-tight tracking-tight">
            Fra faktura i indbakken til betalt og bogført – uden at løfte en finger.
          </p>
          <ul className="mt-6 space-y-2 text-sm text-white/80">
            <li>✓ AI aflæser og konterer på sekunder</li>
            <li>✓ Stopper svindel med ændrede kontonumre</li>
            <li>✓ Betaler via din bank på forfaldsdagen</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
