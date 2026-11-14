"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  FileUp,
  History,
  Package,
  RotateCcw,
  Sheet as SheetIcon,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { commitImport, previewImport } from "@/app/actions/import";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  autoMap,
  buildRows,
  detectHeaderRow,
  FIELD_INFO,
  IMPORT_FIELDS,
  TEMPLATE_HEADERS,
  type ColumnMapping,
  type ImportField,
  type ImportRow,
} from "@/lib/excel/columns";
import type { ImportOptions, RowOutcome } from "@/lib/excel/import";
import { formatPct } from "@/lib/format";
import { formatINR } from "@/lib/money";
import { changePct } from "@/lib/pricing";
import { cn } from "@/lib/utils";

type SheetData = { name: string; rows: unknown[][] };
type Step = "file" | "columns" | "preview" | "done";
const NONE = "__none";
const CHUNK = 400;

const STATUS_META: Record<RowOutcome["status"], { label: string; variant: "info" | "warning" | "muted" | "destructive" | "success" }> = {
  create: { label: "New", variant: "info" },
  update: { label: "Update", variant: "warning" },
  unchanged: { label: "No change", variant: "muted" },
  error: { label: "Problem", variant: "destructive" },
  skipped: { label: "Skipped", variant: "muted" },
};

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function downloadTemplate() {
  const XLSX = await import("xlsx");
  const headers = TEMPLATE_HEADERS.map((h) => h.header);
  const sheet = XLSX.utils.aoa_to_sheet([
    headers,
    ["", "8901234567890", "Crompton High Speed Plus Ceiling Fan 1200 mm, Brown", "Crompton", "HS PLUS 48", "Fans", "84145110", 18, 2118, 3250, 14],
    ["ELEC-1002", "", "", "", "", "", "", "", 3480, 5390, ""],
  ]);
  sheet["!cols"] = headers.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  const help = XLSX.utils.aoa_to_sheet([
    ["How this sheet is read"],
    [""],
    ["Matching", "Rows are matched to existing products by SKU, then Barcode, then Brand + Model number."],
    ["Prices", "Dealer price is per unit, excluding GST. A column named 'Dealer price incl. GST' also works."],
    ["Blank cells", "Leave a cell empty to keep the current value."],
    ["New products", "Rows that match nothing become new products (needs name, dealer price and MRP)."],
    ["Stock", "Stock replaces the current count when 'Update stock' is ticked."],
    ["Row 3 example", "Only SKU + prices: updates the price of an existing product and nothing else."],
  ]);
  help["!cols"] = [{ wch: 16 }, { wch: 90 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Products");
  XLSX.utils.book_append_sheet(wb, help, "How to fill");
  XLSX.writeFile(wb, "electroprice-import-template.xlsx");
}

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "file", label: "Choose file" },
    { key: "columns", label: "Check columns" },
    { key: "preview", label: "Preview changes" },
    { key: "done", label: "Done" },
  ];
  const current = steps.findIndex((s) => s.key === step);
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
              i < current ? "bg-success text-white" : i === current ? "clay-primary" : "clay-well text-muted-foreground",
            )}
          >
            {i < current ? <Check className="size-3.5" /> : i + 1}
          </span>
          <span className={cn(i === current ? "font-medium" : "text-muted-foreground")}>{s.label}</span>
          {i < steps.length - 1 ? <span className="mx-1 h-px w-6 bg-border" aria-hidden /> : null}
        </li>
      ))}
    </ol>
  );
}

function Diff({ v }: { v?: { from: number | null; to: number } }) {
  if (!v) return <span className="text-muted-foreground">—</span>;
  if (v.from === null) return <span className="font-mono">{formatINR(v.to)}</span>;
  const pct = changePct(v.from, v.to);
  return (
    <span className="font-mono whitespace-nowrap">
      <span className="text-muted-foreground">{formatINR(v.from)}</span> → {formatINR(v.to)}{" "}
      <span className={cn("text-xs", v.to > v.from ? "text-warning-foreground" : "text-success-foreground")}>{formatPct(pct)}</span>
    </span>
  );
}

export function ImportWizard() {
  const [step, setStep] = useState<Step>("file");
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [options, setOptions] = useState<ImportOptions>({ createMissing: true, updateDetails: false, updateStock: true });
  const [outcomes, setOutcomes] = useState<RowOutcome[]>([]);
  const [filter, setFilter] = useState<"changes" | RowOutcome["status"] | "all">("changes");
  const [busy, setBusy] = useState<{ label: string; progress: number } | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; priceChanges: number; errors: number; failedBatches: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const sheet = sheets[sheetIndex];
  const headers = useMemo(() => (sheet?.rows[headerRow] ?? []).map((h) => String(h ?? "").trim()), [sheet, headerRow]);
  const rows = useMemo<ImportRow[]>(() => (sheet ? buildRows(sheet.rows, headerRow, mapping) : []), [sheet, headerRow, mapping]);
  const hasIdentifier = mapping.sku !== undefined || mapping.barcode !== undefined || mapping.model !== undefined || mapping.name !== undefined;
  const hasPrice = mapping.dealer !== undefined || mapping.dealerIncl !== undefined || mapping.mrp !== undefined;

  const readFile = async (file: File) => {
    if (file.size > 8 * 1024 * 1024) {
      toast.error("That file is over 8 MB. Split it into smaller sheets.");
      return;
    }
    setBusy({ label: "Reading the file…", progress: 30 });
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
      const parsed = wb.SheetNames.map((name) => ({
        name,
        rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, raw: true, defval: null, blankrows: true }),
      })).filter((s) => s.rows.length > 1);
      if (parsed.length === 0) {
        toast.error("No rows found in that file.");
        return;
      }
      // Prefer the sheet whose header row maps best.
      const scored = parsed.map((s, i) => ({ i, score: Object.keys(autoMap(s.rows[detectHeaderRow(s.rows)] ?? [])).length }));
      const bestSheet = scored.sort((a, b) => b.score - a.score)[0]!.i;
      const h = detectHeaderRow(parsed[bestSheet]!.rows);
      setSheets(parsed);
      setSheetIndex(bestSheet);
      setHeaderRow(h);
      setMapping(autoMap(parsed[bestSheet]!.rows[h] ?? []));
      setFileName(file.name);
      setStep("columns");
    } catch {
      toast.error("That file couldn't be read. Use .xlsx, .xls or .csv.");
    } finally {
      setBusy(null);
    }
  };

  const changeSheet = (i: number) => {
    const s = sheets[i];
    if (!s) return;
    const h = detectHeaderRow(s.rows);
    setSheetIndex(i);
    setHeaderRow(h);
    setMapping(autoMap(s.rows[h] ?? []));
  };

  const runPreview = async () => {
    const parts = chunks(rows, CHUNK);
    const all: RowOutcome[] = [];
    for (const [i, part] of parts.entries()) {
      setBusy({ label: `Checking rows ${i * CHUNK + 1}–${i * CHUNK + part.length} of ${rows.length}…`, progress: ((i + 0.5) / parts.length) * 100 });
      const res = await previewImport(part, options);
      if (!res.ok) {
        setBusy(null);
        toast.error(res.error);
        return;
      }
      all.push(...res.outcomes);
    }
    setBusy(null);
    setOutcomes(all);
    setFilter(all.some((o) => o.status === "create" || o.status === "update") ? "changes" : "all");
    setStep("preview");
  };

  const runCommit = async () => {
    const changing = new Set(outcomes.filter((o) => o.status === "create" || o.status === "update").map((o) => o.rowNumber));
    const toSend = rows.filter((r) => changing.has(r.rowNumber));
    const parts = chunks(toSend, 250);
    const total = { created: 0, updated: 0, priceChanges: 0, errors: 0, failedBatches: 0 };
    for (const [i, part] of parts.entries()) {
      setBusy({ label: `Saving batch ${i + 1} of ${parts.length}…`, progress: ((i + 0.5) / parts.length) * 100 });
      const res = await commitImport(part, options, fileName);
      if (res.ok) {
        total.created += res.created;
        total.updated += res.updated;
        total.priceChanges += res.priceChanges;
        total.errors += res.errors;
      } else {
        total.failedBatches += 1;
        toast.error(res.error);
      }
    }
    setBusy(null);
    setResult(total);
    setStep("done");
  };

  const reset = () => {
    setStep("file");
    setSheets([]);
    setOutcomes([]);
    setResult(null);
    setFileName("");
  };

  const counts = useMemo(() => {
    const c = { create: 0, update: 0, unchanged: 0, error: 0, skipped: 0 };
    for (const o of outcomes) c[o.status]++;
    return c;
  }, [outcomes]);
  const visible = outcomes.filter((o) =>
    filter === "all" ? true : filter === "changes" ? o.status === "create" || o.status === "update" : o.status === filter,
  );
  const sample = (col: number | undefined) =>
    col === undefined
      ? ""
      : (sheet?.rows ?? [])
          .slice(headerRow + 1)
          .map((r) => r?.[col])
          .filter((v) => v !== null && v !== undefined && String(v).trim() !== "")
          .slice(0, 2)
          .map(String)
          .join(" · ");

  return (
    <div className="space-y-5">
      <Stepper step={step} />

      {busy ? (
        <div className="clay-card space-y-2 rounded-2xl p-5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Spinner /> {busy.label}
          </p>
          <Progress value={busy.progress} />
        </div>
      ) : null}

      {step === "file" && !busy ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) void readFile(f);
            }}
            className={cn(
              "flex min-h-72 cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-input bg-(--fill-well) p-8 text-center shadow-well transition-colors",
              dragging ? "border-primary bg-accent" : "hover:border-primary/40 hover:bg-accent/40",
            )}
          >
            <span className="orb tone-teal size-14 rounded-2xl">
              <FileSpreadsheet className="size-7" />
            </span>
            <span>
              <span className="block text-base font-semibold">Drop an Excel or CSV file here</span>
              <span className="mt-1 block text-sm text-muted-foreground">or click to choose · .xlsx, .xls, .csv up to 8 MB</span>
            </span>
            <span className={buttonVariants({ className: "pointer-events-none" })}>
              <FileUp data-icon="inline-start" /> Choose file
            </span>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void readFile(f);
              }}
            />
          </label>
          <aside className="clay-card space-y-4 rounded-2xl p-5">
            <div>
              <h2 className="text-sm font-semibold">No sheet yet?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Start from the template, or export your current products, edit prices in Excel and upload the file back.
              </p>
            </div>
            <Button variant="outline" className="w-full" onClick={() => void downloadTemplate()}>
              <SheetIcon data-icon="inline-start" /> Download template
            </Button>
            <div className="space-y-2 border-t pt-4 text-sm text-muted-foreground">
              <p className="flex gap-2">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" /> Supplier price lists work too: columns like “D.P.”, “M.R.P.” and “Model No.” are recognised.
              </p>
            </div>
          </aside>
        </div>
      ) : null}

      {step === "columns" && sheet && !busy ? (
        <div className="space-y-5">
          <div className="clay-card rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{fileName}</p>
                <p className="text-sm text-muted-foreground">
                  {rows.length} rows found under the header in row {headerRow + 1}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {sheets.length > 1 ? (
                  <Select value={String(sheetIndex)} onValueChange={(v) => changeSheet(Number(v))} items={sheets.map((s, i) => ({ value: String(i), label: `Sheet: ${s.name}` }))}>
                    <SelectTrigger className="h-9 min-w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sheets.map((s, i) => (
                        <SelectItem key={s.name} value={String(i)}>
                          Sheet: {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null}
                <Select
                  value={String(headerRow)}
                  onValueChange={(v) => {
                    const h = Number(v);
                    setHeaderRow(h);
                    setMapping(autoMap(sheet.rows[h] ?? []));
                  }}
                  items={sheet.rows.slice(0, 15).map((_, i) => ({ value: String(i), label: `Header in row ${i + 1}` }))}
                >
                  <SelectTrigger className="h-9 min-w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sheet.rows.slice(0, 15).map((_, i) => (
                      <SelectItem key={i} value={String(i)}>
                        Header in row {i + 1}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="clay-card overflow-hidden rounded-2xl">
            <div className="border-b px-5 py-3.5">
              <h2 className="text-sm font-semibold">Which column holds what?</h2>
              <p className="text-sm text-muted-foreground">Detected automatically. Change any that look wrong.</p>
            </div>
            <div className="divide-y">
              {IMPORT_FIELDS.map((field: ImportField) => {
                const col = mapping[field];
                return (
                  <div key={field} className="grid items-center gap-2 px-5 py-2.5 sm:grid-cols-[14rem_16rem_1fr]">
                    <div>
                      <p className="text-sm font-medium">{FIELD_INFO[field].label}</p>
                      {FIELD_INFO[field].hint ? <p className="text-xs text-muted-foreground">{FIELD_INFO[field].hint}</p> : null}
                    </div>
                    <Select
                      value={col === undefined ? NONE : String(col)}
                      onValueChange={(v) =>
                        setMapping((m) => {
                          const next = { ...m };
                          if (v === NONE) delete next[field];
                          else next[field] = Number(v);
                          return next;
                        })
                      }
                      items={[{ value: NONE, label: "Not in this file" }, ...headers.map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }))]}
                    >
                      <SelectTrigger className={cn("h-9 w-full", col !== undefined && "border-primary/40 bg-accent/40")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Not in this file</SelectItem>
                        {headers.map((h, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {h || `Column ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="truncate font-mono text-xs text-muted-foreground">{sample(col)}</p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="clay-card rounded-2xl p-5">
            <h2 className="text-sm font-semibold">Options</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["createMissing", "Create new products", "Rows that match nothing become new products."],
                  ["updateStock", "Update stock", "Replace stock counts with the sheet's Stock column."],
                  ["updateDetails", "Update details too", "Name, brand, category, HSN and GST, not just prices."],
                ] as const
              ).map(([key, title, desc]) => (
                <label key={key} className="clay-raised flex cursor-pointer items-start gap-3 rounded-xl p-3 transition-shadow hover:shadow-clay has-data-checked:ring-2 has-data-checked:ring-primary/30">
                  <Checkbox checked={options[key]} onCheckedChange={(v) => setOptions((o) => ({ ...o, [key]: v === true }))} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">{title}</span>
                    <span className="block text-xs text-muted-foreground">{desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={reset}>
              <RotateCcw data-icon="inline-start" /> Choose another file
            </Button>
            <div className="flex items-center gap-3">
              {!hasIdentifier || !hasPrice ? (
                <p className="flex items-center gap-1.5 text-sm text-warning-foreground">
                  <AlertTriangle className="size-4" /> Map at least one identifier (SKU, barcode, model or name) and one price.
                </p>
              ) : null}
              <Button onClick={() => void runPreview()} disabled={!hasIdentifier || !hasPrice || rows.length === 0}>
                Preview {rows.length} rows <ArrowRight data-icon="inline-end" />
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {step === "preview" && !busy ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {(
              [
                ["create", "New products", "text-info-foreground bg-info-soft"],
                ["update", "Updates", "text-warning-foreground bg-warning-soft"],
                ["unchanged", "No change", "text-muted-foreground bg-surface"],
                ["error", "Problems", "text-destructive bg-destructive/8"],
                ["skipped", "Skipped", "text-muted-foreground bg-surface"],
              ] as const
            ).map(([key, label, tone]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn("rounded-xl border p-3 text-left transition-colors hover:border-primary/40", filter === key && "border-primary ring-1 ring-primary/20")}
              >
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={cn("text-price mt-1 inline-block rounded-md px-1.5 text-2xl", tone)}>{counts[key]}</p>
              </button>
            ))}
          </div>

          <div className="clay-card overflow-hidden rounded-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                <TabsList>
                  <TabsTrigger value="changes">Changes</TabsTrigger>
                  <TabsTrigger value="error">Problems</TabsTrigger>
                  <TabsTrigger value="all">All rows</TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-xs text-muted-foreground">{visible.length} shown</p>
            </div>
            <div className="max-h-[32rem] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow className="bg-surface/60 hover:bg-surface/60">
                    <TableHead className="w-16 pl-4">Row</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Dealer ex GST</TableHead>
                    <TableHead>MRP</TableHead>
                    <TableHead className="pr-4">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((o) => (
                    <TableRow key={o.rowNumber}>
                      <TableCell className="pl-4 font-mono text-xs text-muted-foreground">{o.rowNumber}</TableCell>
                      <TableCell className="max-w-72">
                        {o.productId ? (
                          <Link href={`/products/${o.productId}`} target="_blank" className="block truncate font-medium hover:underline">
                            {o.name}
                          </Link>
                        ) : (
                          <span className="block truncate font-medium">{o.name}</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {o.skuCode ? <span className="font-mono">{o.skuCode}</span> : o.status === "create" ? "SKU on save" : null}
                          {o.match ? ` · matched by ${o.match}` : ""}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_META[o.status].variant}>{STATUS_META[o.status].label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Diff v={o.dealer} />
                      </TableCell>
                      <TableCell>
                        <Diff v={o.mrp} />
                      </TableCell>
                      <TableCell className="max-w-80 pr-4 text-xs">
                        {o.stock ? <span className="block">Stock {o.stock.from ?? 0} → {o.stock.to}</span> : null}
                        {o.details.length ? <span className="block">Also: {o.details.join(", ")}</span> : null}
                        {o.messages.map((m) => (
                          <span key={m} className={cn("block", o.status === "error" ? "text-destructive" : "text-warning-foreground")}>
                            {m}
                          </span>
                        ))}
                      </TableCell>
                    </TableRow>
                  ))}
                  {visible.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                        Nothing in this group.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep("columns")}>
              Back to columns
            </Button>
            <div className="flex items-center gap-3">
              {counts.error > 0 ? (
                <p className="text-sm text-muted-foreground">{counts.error} rows with problems will be left out.</p>
              ) : null}
              <Button onClick={() => void runCommit()} disabled={counts.create + counts.update === 0}>
                <Check data-icon="inline-start" /> Apply {counts.create + counts.update} changes
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {step === "done" && result ? (
        <div className="clay-card flex flex-col items-center gap-4 rounded-2xl px-6 py-12 text-center">
          <span className={cn("flex size-14 items-center justify-center rounded-2xl", result.failedBatches ? "bg-warning-soft text-warning-foreground" : "bg-success-soft text-success-foreground")}>
            {result.failedBatches ? <AlertTriangle className="size-7" /> : <CheckCircle2 className="size-7" />}
          </span>
          <div>
            <h2 className="text-lg font-semibold">{result.failedBatches ? "Import partly saved" : "Import complete"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {result.updated} {result.updated === 1 ? "product" : "products"} updated ({result.priceChanges} price {result.priceChanges === 1 ? "change" : "changes"}) · {result.created} new {result.created === 1 ? "product" : "products"}
              {result.failedBatches ? ` · ${result.failedBatches} batch(es) failed and were not saved` : ""}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href="/admin/history?source=EXCEL_BULK" className={buttonVariants({ variant: "outline" })}>
              <History data-icon="inline-start" /> See the price changes
            </Link>
            <Link href="/admin/products" className={buttonVariants({ variant: "outline" })}>
              <Package data-icon="inline-start" /> Products
            </Link>
            <Button onClick={reset}>
              <FileUp data-icon="inline-start" /> Import another file
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
