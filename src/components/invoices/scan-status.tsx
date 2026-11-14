"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Clock, Loader2, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { discardInvoice } from "@/app/actions/invoices";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export type ScanStatus = "UPLOADED" | "EXTRACTING" | "PENDING_REVIEW" | "COMMITTED" | "FAILED" | "DISCARDED";

const META: Record<ScanStatus, { label: string; variant: "info" | "warning" | "success" | "destructive" | "muted"; icon: React.ComponentType<{ className?: string }> }> = {
  UPLOADED: { label: "Not read yet", variant: "muted", icon: Clock },
  EXTRACTING: { label: "Reading…", variant: "info", icon: Loader2 },
  PENDING_REVIEW: { label: "To review", variant: "warning", icon: Sparkles },
  COMMITTED: { label: "Confirmed", variant: "success", icon: CheckCircle2 },
  FAILED: { label: "Couldn't read", variant: "destructive", icon: AlertCircle },
  DISCARDED: { label: "Discarded", variant: "muted", icon: Trash2 },
};

export function ScanStatusBadge({ status }: { status: ScanStatus }) {
  const m = META[status];
  return (
    <Badge variant={m.variant}>
      <m.icon data-icon="inline-start" className={status === "EXTRACTING" ? "animate-spin" : undefined} />
      {m.label}
    </Badge>
  );
}

/** Retry / discard for scans that haven't produced a review yet. */
export function ExtractActions({ scanId, status, canDiscard }: { scanId: string; status: ScanStatus; canDiscard: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  const retry = async () => {
    setBusy(true);
    const res = await fetch(`/api/invoices/${scanId}/extract`, { method: "POST" });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) toast.error(data.error ?? "Still couldn't read it.");
    router.refresh();
  };

  return (
    <div className="flex flex-wrap gap-2">
      {status === "EXTRACTING" ? (
        <Button variant="outline" onClick={() => router.refresh()}>
          <RotateCcw data-icon="inline-start" /> Check again
        </Button>
      ) : (
        <Button onClick={() => void retry()} disabled={busy}>
          {busy ? <Spinner /> : <Sparkles data-icon="inline-start" />} {status === "FAILED" ? "Try reading again" : "Read invoice"}
        </Button>
      )}
      {canDiscard ? (
        <Button
          variant="ghost"
          disabled={pending || busy}
          onClick={() =>
            startTransition(async () => {
              const res = await discardInvoice(scanId);
              if (res.ok) {
                toast.success("Invoice discarded.");
                router.push("/invoices");
              } else toast.error(res.error);
            })
          }
        >
          <Trash2 data-icon="inline-start" /> Discard
        </Button>
      ) : null}
    </div>
  );
}
