"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, FileScan, Hash, Percent, Store } from "lucide-react";
import { toast } from "sonner";
import { saveSettings, type SettingsInput } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

// GST 2.0 slabs in force since 22 Sep 2025. Products can still carry any rate.
const GST_SLABS = [0, 5, 18, 40];

type Values = {
  businessName: string;
  staffCanSeeDealerPrice: boolean;
  skuPrefix: string;
  defaultGst: number;
  mrpMarkupPct: number | null;
  addInvoiceQtyToStock: boolean;
  purgeInvoiceFilesAfterDays: number;
};

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="clay-card grid gap-5 rounded-2xl p-5 md:grid-cols-[15rem_1fr] md:gap-8 md:p-6">
      <div className="flex gap-3 md:block">
        <span className="orb tone-teal size-10 shrink-0 rounded-xl md:mb-3">
          <Icon className="size-[18px]" />
        </span>
        <div>
          <h2 className="font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

export function SettingsForm({ initial, nextSkuNumber }: { initial: Values; nextSkuNumber: number }) {
  const [values, setValues] = useState<Values>(initial);
  const [saved, setSaved] = useState<Values>(initial);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(values) !== JSON.stringify(saved);
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues((v) => ({ ...v, [key]: value }));

  const submit = () =>
    startTransition(async () => {
      const payload: SettingsInput = { ...values, skuPrefix: values.skuPrefix.toUpperCase() };
      const result = await saveSettings(payload);
      if (result.ok) {
        setSaved(values);
        toast.success(result.message ?? "Saved");
      } else toast.error(result.error);
    });

  return (
    <form
      className="space-y-4 pb-24"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Section icon={Store} title="Shop" description="Shown in the sidebar and on printed labels.">
        <Field>
          <FieldLabel htmlFor="businessName">Shop name</FieldLabel>
          <Input
            id="businessName"
            className="h-10 max-w-md"
            value={values.businessName}
            onChange={(e) => set("businessName", e.target.value)}
          />
        </Field>
      </Section>

      <Section
        icon={values.staffCanSeeDealerPrice ? Eye : EyeOff}
        title="Price visibility"
        description="Admins always see dealer price, landing cost and margin."
      >
        <Field orientation="horizontal" className="clay-well rounded-xl p-4">
          <FieldContent>
            <FieldTitle>Staff can see dealer price</FieldTitle>
            <FieldDescription>
              Off: staff see MRP and GST only. Dealer price, landing cost and margin are removed on the server, not just hidden.
            </FieldDescription>
          </FieldContent>
          <Switch
            checked={values.staffCanSeeDealerPrice}
            onCheckedChange={(v) => set("staffCanSeeDealerPrice", v)}
            aria-label="Staff can see dealer price"
          />
        </Field>
      </Section>

      <Section icon={Hash} title="Product codes" description="SKUs are given to new products automatically.">
        <Field>
          <FieldLabel htmlFor="skuPrefix">SKU prefix</FieldLabel>
          <div className="flex flex-wrap items-center gap-3">
            <Input
              id="skuPrefix"
              className="h-10 w-36 font-mono uppercase"
              maxLength={8}
              value={values.skuPrefix}
              onChange={(e) => set("skuPrefix", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            />
            <span className="text-sm text-muted-foreground">
              Next product gets{" "}
              <span className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-foreground">
                {(values.skuPrefix || "ELEC").toUpperCase()}-{nextSkuNumber}
              </span>
            </span>
          </div>
          <FieldDescription>2–8 letters or digits. Existing SKUs keep their codes.</FieldDescription>
        </Field>
      </Section>

      <Section icon={Percent} title="Pricing defaults" description="Used when a new product doesn't say otherwise.">
        <Field>
          <FieldLabel>Default GST rate</FieldLabel>
          <ToggleGroup
            value={[String(values.defaultGst)]}
            onValueChange={(v) => v[0] !== undefined && set("defaultGst", Number(v[0]))}
            variant="outline"
            className="flex-wrap"
          >
            {GST_SLABS.map((slab) => (
              <ToggleGroupItem key={slab} value={String(slab)} className="min-w-16 font-mono data-pressed:border-primary data-pressed:bg-accent data-pressed:text-accent-foreground">
                {slab}%
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {!GST_SLABS.includes(values.defaultGst) ? (
            <FieldDescription>Current default: {values.defaultGst}% (an older slab).</FieldDescription>
          ) : (
            <FieldDescription>GST 2.0 slabs. Individual products can use any rate.</FieldDescription>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="markup">Suggested MRP markup</FieldLabel>
          <InputGroup className="h-10 max-w-44">
            <InputGroupInput
              id="markup"
              inputMode="decimal"
              className="font-mono"
              placeholder="Off"
              value={values.mrpMarkupPct ?? ""}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d.]/g, "");
                set("mrpMarkupPct", raw === "" ? null : Number(raw));
              }}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>% on landing</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription>
            When an invoice brings a new product without a printed MRP, suggest landing cost plus this much (rounded up to ₹10). Leave empty to always type MRP.
          </FieldDescription>
        </Field>
      </Section>

      <Section icon={FileScan} title="Invoices" description="How confirmed supplier invoices affect products.">
        <Field orientation="horizontal" className="clay-well rounded-xl p-4">
          <FieldContent>
            <FieldTitle>Add invoice quantities to stock</FieldTitle>
            <FieldDescription>When an invoice is confirmed, add each line&apos;s quantity to that product&apos;s stock.</FieldDescription>
          </FieldContent>
          <Switch
            checked={values.addInvoiceQtyToStock}
            onCheckedChange={(v) => set("addInvoiceQtyToStock", v)}
            aria-label="Add invoice quantities to stock"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="purge">Delete invoice images after</FieldLabel>
          <InputGroup className="h-10 max-w-44">
            <InputGroupInput
              id="purge"
              inputMode="numeric"
              className="font-mono"
              value={values.purgeInvoiceFilesAfterDays}
              onChange={(e) => set("purgeInvoiceFilesAfterDays", Number(e.target.value.replace(/\D/g, "") || 0))}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupText>days</InputGroupText>
            </InputGroupAddon>
          </InputGroup>
          <FieldDescription>
            Counted from confirmation. Extracted prices and history are kept; only the photo or PDF is removed to save database space.
          </FieldDescription>
        </Field>
      </Section>

      {/* Save bar */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-[calc(4.5rem+max(0.75rem,env(safe-area-inset-bottom)))] z-30 flex justify-center px-4 transition-all duration-200 md:bottom-6 md:left-(--sidebar-width)",
          dirty ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
        )}
      >
        <div className="glass flex w-full max-w-lg items-center justify-between gap-3 rounded-2xl border border-(--clay-edge) p-2.5 pl-4 shadow-clay-lg [--glass-alpha:90%]">
          <span className="text-sm font-medium">Unsaved changes</span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => setValues(saved)} disabled={pending}>
              Discard
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : null} Save
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
