"use client";

import { useState, useTransition } from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { quickUpdatePrice } from "@/app/actions/products";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatPct } from "@/lib/format";
import { formatINR, parseMoney, toDecimalString, type Paise } from "@/lib/money";
import { changePct, dealerFromLanding, landingPaise, marginPct } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export type QuickPriceProduct = {
  id: string;
  name: string;
  skuCode: string;
  gstPct: number;
  dealerPrice: Paise;
  mrp: Paise;
};

const rupees = (p: Paise) => toDecimalString(p).replace(/\.00$/, "");

function Delta({ from, to }: { from: Paise; to: Paise | null }) {
  if (to === null || to === from) return null;
  const pct = changePct(from, to);
  return (
    <span className={cn("font-mono text-xs", to > from ? "text-warning-foreground" : "text-success-foreground")}>
      {formatINR(from)} <ArrowRight className="inline size-3" /> {formatINR(to)} ({formatPct(pct)})
    </span>
  );
}

export function QuickPriceDialog({
  product,
  open,
  onOpenChange,
}: {
  product: QuickPriceProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [basis, setBasis] = useState<"ex" | "incl">("ex");
  const [dealerText, setDealerText] = useState(rupees(product.dealerPrice));
  const [mrpText, setMrpText] = useState(rupees(product.mrp));
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const typed = parseMoney(dealerText);
  const dealer = typed === null ? null : basis === "incl" ? dealerFromLanding(typed, product.gstPct) : typed;
  const mrp = parseMoney(mrpText);
  const landing = dealer === null ? null : landingPaise(dealer, product.gstPct);
  const margin = landing !== null && mrp ? marginPct(landing, mrp) : null;
  const unchanged = dealer === product.dealerPrice && mrp === product.mrp;
  const belowCost = landing !== null && mrp !== null && mrp < landing;

  const switchBasis = (next: "ex" | "incl") => {
    if (next === basis) return;
    if (typed !== null) {
      setDealerText(rupees(next === "incl" ? landingPaise(typed, product.gstPct) : dealerFromLanding(typed, product.gstPct)));
    }
    setBasis(next);
  };

  const helper =
    basis === "incl"
      ? `Converted to ${dealer !== null ? formatINR(dealer) : "—"} ex GST at ${product.gstPct}%.`
      : `Landing ${landing !== null ? formatINR(landing) : "—"} incl. ${product.gstPct}% GST.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (dealer === null || mrp === null) return;
            startTransition(async () => {
              const res = await quickUpdatePrice({
                id: product.id,
                dealerPrice: toDecimalString(dealer),
                mrp: toDecimalString(mrp),
                note,
              });
              if (res.ok) {
                toast.success(res.message);
                onOpenChange(false);
              } else toast.error(res.error);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Update price</DialogTitle>
            <DialogDescription className="line-clamp-2">
              {product.name} <span className="font-mono">· {product.skuCode}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="my-5 space-y-4">
            <Field>
              <div className="flex items-center justify-between gap-3">
                <FieldLabel htmlFor="qp-dealer">Dealer price</FieldLabel>
                <ToggleGroup value={[basis]} onValueChange={(v) => v[0] && switchBasis(v[0] as "ex" | "incl")} variant="outline" size="sm">
                  <ToggleGroupItem value="ex" className="px-2 text-xs data-pressed:bg-accent data-pressed:text-accent-foreground">
                    ex GST
                  </ToggleGroupItem>
                  <ToggleGroupItem value="incl" className="px-2 text-xs data-pressed:bg-accent data-pressed:text-accent-foreground">
                    incl. GST
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              <InputGroup className="h-11">
                <InputGroupAddon>
                  <InputGroupText>₹</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id="qp-dealer"
                  inputMode="decimal"
                  autoFocus
                  className="font-mono text-base"
                  value={dealerText}
                  onChange={(e) => setDealerText(e.target.value)}
                  aria-invalid={typed === null}
                />
              </InputGroup>
              <FieldDescription className="flex flex-wrap justify-between gap-x-3">
                <span>{helper}</span>
                <Delta from={product.dealerPrice} to={dealer} />
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="qp-mrp">MRP</FieldLabel>
              <InputGroup className="h-11">
                <InputGroupAddon>
                  <InputGroupText>₹</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id="qp-mrp"
                  inputMode="decimal"
                  className="font-mono text-base"
                  value={mrpText}
                  onChange={(e) => setMrpText(e.target.value)}
                  aria-invalid={mrp === null || belowCost}
                />
              </InputGroup>
              <FieldDescription className="flex flex-wrap justify-between gap-x-3">
                <span className={cn(belowCost && "text-destructive")}>
                  {belowCost ? "MRP is below the landing cost." : `Margin ${margin !== null ? `${margin.toFixed(1)}%` : "—"}`}
                </span>
                <Delta from={product.mrp} to={mrp} />
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="qp-note">Reason (optional)</FieldLabel>
              <Input
                id="qp-note"
                className="h-10"
                placeholder="e.g. New rate from distributor call"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || dealer === null || mrp === null || unchanged}>
              {pending ? <Spinner /> : null} Save price
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
