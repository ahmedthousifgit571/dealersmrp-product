"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCcw, ServerCrash } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <ServerCrash className="size-7" />
      </span>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          The page couldn&apos;t load. It&apos;s usually a dropped connection. Try again; nothing you saved is lost.
        </p>
        {error.digest ? <p className="font-mono text-xs text-muted-foreground">Ref {error.digest}</p> : null}
      </div>
      <div className="flex gap-2">
        <Button onClick={reset}>
          <RotateCcw data-icon="inline-start" /> Try again
        </Button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          Price Finder
        </Link>
      </div>
    </main>
  );
}
