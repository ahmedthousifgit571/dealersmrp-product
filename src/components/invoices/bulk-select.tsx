"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { discardInvoices } from "@/app/actions/invoices";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Ctx = {
  ids: string[]; // invoices on this page that can be discarded
  selected: Set<string>;
  toggle: (id: string) => void;
  toggleAll: () => void;
};

const SelectCtx = createContext<Ctx | null>(null);

/** Wraps the invoice list. `ids` are the rows that can still be discarded. */
export function BulkSelectProvider({ ids, children }: { ids: string[]; children: ReactNode }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Ignore ids that disappeared after a refresh.
  const live = new Set([...selected].filter((id) => ids.includes(id)));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(live.size === ids.length ? new Set() : new Set(ids));

  const run = () =>
    startTransition(async () => {
      const res = await discardInvoices([...live]);
      setOpen(false);
      if (res.ok) {
        toast.success(`${res.discarded} invoice${res.discarded === 1 ? "" : "s"} discarded.`);
        setSelected(new Set());
        router.refresh();
      } else toast.error(res.error);
    });

  return (
    <SelectCtx.Provider value={{ ids, selected: live, toggle, toggleAll }}>
      {live.size > 0 ? (
        <div className="clay-card sticky top-28 z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-2.5">
          <p className="text-sm font-medium">{live.size} selected</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
              <X data-icon="inline-start" /> Clear
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
              <Trash2 data-icon="inline-start" /> Discard {live.size}
            </Button>
          </div>
        </div>
      ) : null}
      {children}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Discard {live.size} invoice{live.size === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>No prices change. Their uploaded pages are deleted. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={run}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SelectCtx.Provider>
  );
}

/** Header checkbox: selects every discardable invoice on the page. */
export function SelectAllCheckbox() {
  const ctx = useContext(SelectCtx);
  if (!ctx || ctx.ids.length === 0) return null;
  const all = ctx.selected.size === ctx.ids.length;
  return (
    <Checkbox
      checked={all}
      indeterminate={!all && ctx.selected.size > 0}
      onCheckedChange={ctx.toggleAll}
      aria-label="Select all invoices that can be discarded"
    />
  );
}

/** Row checkbox. Renders nothing for confirmed or already discarded invoices. */
export function RowCheckbox({ id, label }: { id: string; label: string }) {
  const ctx = useContext(SelectCtx);
  if (!ctx || !ctx.ids.includes(id)) return null;
  return <Checkbox checked={ctx.selected.has(id)} onCheckedChange={() => ctx.toggle(id)} aria-label={`Select ${label}`} />;
}
