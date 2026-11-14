"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, Barcode, Boxes, IndianRupee, Info, Package, Save } from "lucide-react";
import { toast } from "sonner";
import { createProduct, updateProduct } from "@/app/actions/products";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatPct } from "@/lib/format";
import { formatINR, parseMoney, toDecimalString } from "@/lib/money";
import { changePct, dealerFromLanding, landingPaise, marginPct } from "@/lib/pricing";
import type { DuplicateHit } from "@/lib/products/mutations";
import { ProductFormSchema, type ProductFormInput, type ProductFormValues } from "@/lib/products/schema";
import { cn } from "@/lib/utils";

const GST_SLABS = ["0", "5", "18", "40"];

type Existing = { id: string; skuCode: string; dealerPrice: number; mrp: number };

function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <section className="clay-card rounded-2xl p-5 md:p-6">
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-muted-foreground" /> {title}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function ProductForm({
  defaults,
  existing,
  brands,
  categories,
}: {
  defaults: ProductFormInput;
  existing?: Existing;
  brands: string[];
  categories: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [basis, setBasis] = useState<"ex" | "incl">("ex");
  const [duplicates, setDuplicates] = useState<DuplicateHit[]>([]);

  const form = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(ProductFormSchema),
    defaultValues: defaults,
    mode: "onBlur",
  });
  const { register, handleSubmit, setValue, setError, formState, control } = form;
  const errors = formState.errors;
  const [barcode, brand, modelNumber, gstRaw, dealerRaw, mrpRaw, allowDup] = useWatch({
    control,
    name: ["barcode", "brand", "modelNumber", "gstPct", "dealerPrice", "mrp", "allowDuplicateModel"],
  });

  const gst = Number(gstRaw) || 0;
  const typedDealer = parseMoney(dealerRaw);
  const dealer = typedDealer === null ? null : basis === "incl" ? dealerFromLanding(typedDealer, gst) : typedDealer;
  const mrp = parseMoney(mrpRaw);
  const landing = dealer === null ? null : landingPaise(dealer, gst);
  const margin = landing !== null && mrp ? marginPct(landing, mrp) : null;

  // Live duplicate check on barcode / brand + model.
  useEffect(() => {
    if (!barcode && !modelNumber) return;
    const controller = new AbortController();
    const id = window.setTimeout(async () => {
      const qs = new URLSearchParams({ barcode: barcode ?? "", brand: brand ?? "", model: modelNumber ?? "" });
      if (existing) qs.set("exclude", existing.id);
      try {
        const res = await fetch(`/api/products/duplicates?${qs}`, { signal: controller.signal });
        if (res.ok) setDuplicates(((await res.json()) as { duplicates: DuplicateHit[] }).duplicates);
      } catch {
        /* aborted or offline: the server checks again on save */
      }
    }, 400);
    return () => {
      window.clearTimeout(id);
      controller.abort();
    };
  }, [barcode, brand, modelNumber, existing]);

  const shownDuplicates = barcode || modelNumber ? duplicates : [];
  const barcodeClash = shownDuplicates.find((d) => d.reason === "barcode");
  const modelClash = shownDuplicates.filter((d) => d.reason === "model");

  const onSubmit = handleSubmit((_parsed, event) => {
    event?.preventDefault();
    const raw = form.getValues();
    const payload: ProductFormInput = {
      ...raw,
      dealerPrice: dealer !== null ? toDecimalString(dealer) : String(raw.dealerPrice ?? ""),
    };
    startTransition(async () => {
      const res = existing ? await updateProduct(existing.id, payload) : await createProduct(payload);
      if (res.ok) {
        toast.success(res.message);
        router.push(`/products/${res.id}`);
        return;
      }
      toast.error(res.error);
      for (const [field, message] of Object.entries(res.fieldErrors ?? {})) {
        setError(field as keyof ProductFormInput, { message });
      }
      if (res.duplicates) setDuplicates(res.duplicates);
    });
  });

  const priceDelta =
    existing && dealer !== null && mrp !== null && (dealer !== existing.dealerPrice || mrp !== existing.mrp)
      ? { dealer: changePct(existing.dealerPrice, dealer), mrp: changePct(existing.mrp, mrp) }
      : null;

  return (
    <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]" noValidate>
      <div className="space-y-5">
        <Section icon={Package} title="Product">
          <Field className="sm:col-span-2" data-invalid={!!errors.name}>
            <FieldLabel htmlFor="name">Name</FieldLabel>
            <Input id="name" className="h-10" placeholder="e.g. Crompton High Speed Plus Ceiling Fan 1200 mm, Brown" aria-invalid={!!errors.name} {...register("name")} />
            <FieldError>{errors.name?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="brand">Brand</FieldLabel>
            <Input id="brand" className="h-10" list="brand-options" autoComplete="off" {...register("brand")} />
            <datalist id="brand-options">
              {brands.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field data-invalid={!!errors.modelNumber}>
            <FieldLabel htmlFor="modelNumber">Model number</FieldLabel>
            <Input id="modelNumber" className="h-10 font-mono" autoComplete="off" aria-invalid={!!errors.modelNumber} {...register("modelNumber")} />
            <FieldError>{errors.modelNumber?.message}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="category">Category</FieldLabel>
            <Input id="category" className="h-10" list="category-options" autoComplete="off" {...register("category")} />
            <datalist id="category-options">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field data-invalid={!!errors.hsnCode}>
            <FieldLabel htmlFor="hsnCode">HSN code</FieldLabel>
            <Input id="hsnCode" className="h-10 font-mono" inputMode="numeric" aria-invalid={!!errors.hsnCode} {...register("hsnCode")} />
            <FieldError>{errors.hsnCode?.message}</FieldError>
          </Field>
        </Section>

        <Section icon={Barcode} title="Codes">
          <Field data-invalid={!!errors.barcode || !!barcodeClash}>
            <FieldLabel htmlFor="barcode">Barcode on the box</FieldLabel>
            <Input id="barcode" className="h-10 font-mono" inputMode="numeric" autoComplete="off" placeholder="EAN / UPC digits" aria-invalid={!!errors.barcode || !!barcodeClash} {...register("barcode")} />
            <FieldError>{errors.barcode?.message}</FieldError>
            <FieldDescription>Scanning this finds the product. Leave empty if there isn&apos;t one.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>SKU</FieldLabel>
            <div className="clay-well flex h-10 items-center rounded-xl px-3 font-mono text-sm text-muted-foreground">
              {existing ? existing.skuCode : "Given automatically on save"}
            </div>
            <FieldDescription>The shop&apos;s own code, printed on labels.</FieldDescription>
          </Field>
          {barcodeClash || modelClash.length > 0 ? (
            <div className="rounded-lg border border-warning/40 bg-warning-soft p-3.5 text-sm text-warning-foreground sm:col-span-2" role="alert">
              <p className="flex items-center gap-2 font-medium">
                <AlertTriangle className="size-4" />
                {barcodeClash ? "This barcode is already used" : "Looks like this product already exists"}
              </p>
              <ul className="mt-2 space-y-1">
                {(barcodeClash ? [barcodeClash] : modelClash).map((d) => (
                  <li key={d.id}>
                    <Link href={`/products/${d.id}`} target="_blank" className="underline underline-offset-2">
                      {d.name}
                    </Link>{" "}
                    <span className="font-mono text-xs">({d.skuCode})</span>
                  </li>
                ))}
              </ul>
              {!barcodeClash ? (
                <label className="mt-3 flex items-start gap-2 text-foreground">
                  <Checkbox checked={!!allowDup} onCheckedChange={(v) => setValue("allowDuplicateModel", v === true)} className="mt-0.5" />
                  <span>It&apos;s a different product with the same model number (e.g. another colour). Save anyway.</span>
                </label>
              ) : null}
            </div>
          ) : null}
        </Section>

        <Section icon={IndianRupee} title="Price and tax">
          <Field data-invalid={!!errors.dealerPrice}>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="dealerPrice">Dealer price</FieldLabel>
              <ToggleGroup
                value={[basis]}
                onValueChange={(v) => {
                  const next = v[0] as "ex" | "incl" | undefined;
                  if (!next || next === basis) return;
                  if (typedDealer !== null) {
                    const converted = next === "incl" ? landingPaise(typedDealer, gst) : dealerFromLanding(typedDealer, gst);
                    setValue("dealerPrice", toDecimalString(converted).replace(/\.00$/, ""));
                  }
                  setBasis(next);
                }}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="ex" className="px-2 text-xs data-pressed:bg-accent data-pressed:text-accent-foreground">ex GST</ToggleGroupItem>
                <ToggleGroupItem value="incl" className="px-2 text-xs data-pressed:bg-accent data-pressed:text-accent-foreground">incl. GST</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <InputGroup className="h-10">
              <InputGroupAddon><InputGroupText>₹</InputGroupText></InputGroupAddon>
              <InputGroupInput id="dealerPrice" inputMode="decimal" className="font-mono" aria-invalid={!!errors.dealerPrice} {...register("dealerPrice")} />
            </InputGroup>
            <FieldError>{errors.dealerPrice?.message}</FieldError>
            <FieldDescription>
              {basis === "incl" && dealer !== null ? `Saved as ${formatINR(dealer)} ex GST.` : "Net rate per unit after discounts."}
            </FieldDescription>
          </Field>
          <Field data-invalid={!!errors.mrp}>
            <FieldLabel htmlFor="mrp">MRP</FieldLabel>
            <InputGroup className="h-10">
              <InputGroupAddon><InputGroupText>₹</InputGroupText></InputGroupAddon>
              <InputGroupInput id="mrp" inputMode="decimal" className="font-mono" aria-invalid={!!errors.mrp} {...register("mrp")} />
            </InputGroup>
            <FieldError>{errors.mrp?.message}</FieldError>
            <FieldDescription>As printed on the box.</FieldDescription>
          </Field>
          <Field className="sm:col-span-2" data-invalid={!!errors.gstPct}>
            <FieldLabel>GST rate</FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup value={GST_SLABS.includes(String(gstRaw)) ? [String(gstRaw)] : []} onValueChange={(v) => v[0] && setValue("gstPct", v[0])} variant="outline">
                {GST_SLABS.map((s) => (
                  <ToggleGroupItem key={s} value={s} className="min-w-14 font-mono data-pressed:border-primary data-pressed:bg-accent data-pressed:text-accent-foreground">
                    {s}%
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <InputGroup className="h-9 w-28">
                <InputGroupInput inputMode="decimal" className="font-mono" aria-label="Other GST rate" {...register("gstPct")} />
                <InputGroupAddon align="inline-end"><InputGroupText>%</InputGroupText></InputGroupAddon>
              </InputGroup>
            </div>
            <FieldError>{errors.gstPct?.message}</FieldError>
          </Field>
        </Section>

        <Section icon={Boxes} title="Stock">
          <Field data-invalid={!!errors.stockQty}>
            <FieldLabel htmlFor="stockQty">Units in stock</FieldLabel>
            <Input id="stockQty" className="h-10 font-mono" inputMode="numeric" aria-invalid={!!errors.stockQty} {...register("stockQty")} />
            <FieldError>{errors.stockQty?.message}</FieldError>
          </Field>
          {existing ? (
            <Field>
              <FieldLabel htmlFor="note">Reason for a price change</FieldLabel>
              <Input id="note" className="h-10" placeholder="Optional, shown in the history" {...register("note")} />
            </Field>
          ) : null}
        </Section>
      </div>

      {/* Summary */}
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <div className="clay-card rounded-2xl p-5">
          <h2 className="text-sm font-semibold">At this price</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-baseline justify-between">
              <dt className="text-muted-foreground">MRP</dt>
              <dd className="text-price text-2xl text-success">{mrp !== null ? formatINR(mrp) : "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-muted-foreground">Dealer ex GST</dt>
              <dd className="font-mono">{dealer !== null ? formatINR(dealer) : "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-muted-foreground">Landing +{gst}%</dt>
              <dd className="font-mono">{landing !== null ? formatINR(landing) : "—"}</dd>
            </div>
            <div className="flex items-baseline justify-between border-t pt-3">
              <dt className="text-muted-foreground">Margin</dt>
              <dd className={cn("font-mono font-semibold", margin !== null && margin < 0 && "text-destructive")}>
                {margin !== null ? `${margin.toFixed(1)}%` : "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className="text-muted-foreground">Profit per unit</dt>
              <dd className="font-mono">{landing !== null && mrp !== null ? formatINR(mrp - landing) : "—"}</dd>
            </div>
          </dl>
          {priceDelta ? (
            <p className="mt-4 flex gap-2 rounded-lg bg-warning-soft p-3 text-xs text-warning-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Price change will be recorded: dealer {formatPct(priceDelta.dealer)}, MRP {formatPct(priceDelta.mrp)}.
              </span>
            </p>
          ) : null}
          {margin !== null && margin < 0 ? (
            <p className="mt-3 text-xs text-destructive">MRP is below the landing cost. Check both prices.</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <Link href={existing ? `/products/${existing.id}` : "/admin/products"} className={buttonVariants({ variant: "outline", className: "flex-1" })}>
            Cancel
          </Link>
          <Button type="submit" className="flex-1" disabled={pending || !!barcodeClash || (modelClash.length > 0 && !allowDup)}>
            {pending ? <Spinner /> : <Save data-icon="inline-start" />}
            {existing ? "Save changes" : "Add product"}
          </Button>
        </div>
      </aside>
    </form>
  );
}
