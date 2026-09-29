"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <h1 className="text-xl font-semibold">Noget gik galt</h1>
      <p className="max-w-md text-sm text-muted">{error.message || "Der opstod en uventet fejl."}</p>
      <Button onClick={reset}>Prøv igen</Button>
    </div>
  );
}
