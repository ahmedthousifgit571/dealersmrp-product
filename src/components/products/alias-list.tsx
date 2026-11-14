"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { removeAlias } from "@/app/actions/products";
import { formatDate } from "@/lib/format";

export function AliasList({
  aliases,
}: {
  aliases: { id: string; aliasName: string; supplierName: string | null; createdAt: string }[];
}) {
  const [pending, startTransition] = useTransition();
  if (aliases.length === 0) {
    return (
      <p className="clay-well mt-4 rounded-xl border-dashed px-4 py-3 text-sm text-muted-foreground">
        None yet. When an invoice line is matched to this product, its wording is remembered here.
      </p>
    );
  }
  return (
    <ul className="mt-4 divide-y rounded-lg border">
      {aliases.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate font-mono text-sm">{a.aliasName}</p>
            <p className="text-xs text-muted-foreground">
              {a.supplierName ?? "Unknown supplier"} · since {formatDate(a.createdAt)}
            </p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await removeAlias(a.id);
                if (res.ok) toast.success(res.message);
                else toast.error(res.error);
              })
            }
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Forget "${a.aliasName}"`}
          >
            <X className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
