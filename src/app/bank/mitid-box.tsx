"use client";

import { useState } from "react";

/** Simuleret bank-/MitID-dialog til sandbox. Ligner flowet i en rigtig bank, men er tydeligt markeret som test. */
export function MitIdBox({ bank, title, lines, approveLabel, approveHref, cancelHref }: { bank: string; title: string; lines: string[]; approveLabel: string; approveHref: string; cancelHref: string }) {
  const [step, setStep] = useState<"id" | "app" | "done">("id");
  const [user, setUser] = useState("");
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#eef1f5] p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between bg-[#0a2540] px-6 py-4 text-white">
          <span className="text-lg font-semibold">{bank}</span>
          <span className="rounded bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-black">SANDBOX</span>
        </div>
        <div className="p-6">
          <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
          <ul className="mt-3 space-y-1 text-sm text-slate-600">
            {lines.map((l) => (
              <li key={l}>• {l}</li>
            ))}
          </ul>
          <div className="mt-6 rounded-xl border border-slate-200 p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="rounded bg-[#0060e6] px-2 py-1 text-xs font-bold tracking-wide text-white">MitID</span>
              <span className="text-xs text-slate-500">Simuleret – ingen rigtig login</span>
            </div>
            {step === "id" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setStep("app");
                  setTimeout(() => setStep("done"), 1400);
                }}
              >
                <label className="text-xs font-medium text-slate-600">BRUGER-ID</label>
                <input
                  autoFocus
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="fx demo"
                  className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-[#0060e6]"
                />
                <button className="mt-4 h-11 w-full rounded-lg bg-[#0060e6] text-sm font-semibold text-white hover:bg-[#004fc0]">Fortsæt</button>
              </form>
            ) : step === "app" ? (
              <div className="py-4 text-center text-sm text-slate-600">
                <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[#0060e6]" />
                Godkend i MitID-appen…
              </div>
            ) : (
              <div className="text-center">
                <p className="mb-4 text-sm text-slate-700">✓ Identitet bekræftet</p>
                <a href={approveHref} className="block h-11 w-full rounded-lg bg-[#0060e6] text-sm font-semibold leading-[44px] text-white hover:bg-[#004fc0]">
                  {approveLabel}
                </a>
              </div>
            )}
          </div>
          <a href={cancelHref} className="mt-4 block text-center text-sm text-slate-500 hover:text-slate-800">
            Afbryd og gå tilbage
          </a>
        </div>
      </div>
    </div>
  );
}
