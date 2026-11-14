"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
  type ExpandedState,
} from "@tanstack/react-table";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CloudCheck,
  FileText,
  Info,
  ListChecks,
  PackagePlus,
  Pencil,
  Replace,
  SkipForward,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { confirmInvoice, discardInvoice, saveReviewDraft } from "@/app/actions/invoices";
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
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDate, formatPct } from "@/lib/format";
import { allIssues, rowStatus, rowWarnings, summarize } from "@/lib/invoice/review";
import type { ReviewDraft, ReviewHeader, ReviewRow } from "@/lib/invoice/schema";
import { formatINR, type Paise } from "@/lib/money";
import { changePct, landingPaise, marginPct, suggestMrp } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { InvoiceViewer, type ViewerFile } from "./invoice-viewer";
import { IssueList, MatchLabel, MoneyInput, ProductPicker, RowStatusBadge, SmallButton, type PickedProduct } from "./review-parts";

type Props = {
  scanId: string;
  editable: boolean;
  canDiscard: boolean;
  draft: ReviewDraft;
  files: ViewerFile[];
  isMock: boolean;
  warnings: string[];
  markupPct: number | null;
  committed: { at: string; by: string | null } | null;
};

const column = createColumnHelper<ReviewRow>();

function Was({ from, to }: { from: Paise | null | undefined; to: Paise | null }) {
  if (from === null || from === undefined || to === null) return null;
  if (from === to) return <span className="block text-[11px] text-muted-foreground">unchanged</span>;
  const pct = changePct(from, to);
  return (
    <span className={cn("block text-[11px] font-medium whitespace-nowrap", to > from ? "text-warning-foreground" : "text-success-foreground")}>
      was {formatINR(from)} · {formatPct(pct)}
    </span>
  );
}

function renderMargin(r: ReviewRow) {
  if (r.action === "SKIP" || r.dealer === null || r.mrp === null) return <span className="text-muted-foreground">—</span>;
  const m = marginPct(landingPaise(r.dealer, r.gstPct), r.mrp);
  return <span className={cn("font-mono text-sm", m !== null && m < 0 && "text-destructive")}>{m !== null ? `${m.toFixed(1)}%` : "—"}</span>;
}

export function InvoiceReview({ scanId, editable, canDiscard, draft, files, isMock, warnings, markupPct, committed }: Props) {
  const router = useRouter();
  const [header, setHeader] = useState<ReviewHeader>(draft.header);
  const [rows, setRows] = useState<ReviewRow[]>(draft.rows);
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [save, setSave] = useState<{ state: "idle" | "saving" | "saved" | "error"; at?: string }>({ state: "idle" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Last state the server has, so autosave only fires on real edits.
  const lastSaved = useRef(JSON.stringify({ header: draft.header, rows: draft.rows }));

  const issues = useMemo(() => allIssues(rows), [rows]);
  const counts = useMemo(() => summarize(rows), [rows]);

  const updateRow = useCallback((key: string, patch: Partial<ReviewRow> | ((r: ReviewRow) => Partial<ReviewRow>)) => {
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...(typeof patch === "function" ? patch(r) : patch) } : r)));
  }, []);

  // Autosave edits (debounced).
  useEffect(() => {
    if (!editable) return;
    const snapshot = JSON.stringify({ header, rows });
    if (snapshot === lastSaved.current) return;
    const id = window.setTimeout(async () => {
      setSave({ state: "saving" });
      const res = await saveReviewDraft(scanId, { header, rows });
      if (res.ok) lastSaved.current = snapshot;
      setSave(res.ok ? { state: "saved", at: res.savedAt } : { state: "error" });
      if (!res.ok) toast.error(res.error);
    }, 1200);
    return () => window.clearTimeout(id);
  }, [header, rows, editable, scanId]);

  const pick = useCallback(
    (key: string, p: PickedProduct) =>
      updateRow(key, (r) => ({
        action: "UPDATE",
        productId: p.id,
        matchedBy: "manual",
        confirmed: true,
        current: p.snapshot,
        gstPct: r.gstPct,
        mrp: r.invoiceMrp ?? (r.mrpSource === "manual" ? r.mrp : p.snapshot.mrp),
        mrpSource: r.invoiceMrp !== null ? "invoice" : r.mrpSource === "manual" ? "manual" : "current",
      })),
    [updateRow],
  );

  const setAction = useCallback(
    (key: string, action: ReviewRow["action"]) =>
      updateRow(key, (r) => {
        if (action === "SKIP") return { action };
        if (action === "CREATE") {
          const landing = r.dealer !== null ? landingPaise(r.dealer, r.gstPct) : null;
          const markup = markupPct !== null && landing !== null ? suggestMrp(landing, markupPct) : null;
          const keepMrp = r.invoiceMrp ?? (r.mrpSource === "manual" ? r.mrp : markup);
          return {
            action,
            productId: null,
            matchedBy: null,
            confirmed: false,
            current: null,
            mrp: keepMrp,
            mrpSource: r.invoiceMrp !== null ? "invoice" : r.mrpSource === "manual" ? "manual" : markup !== null ? "markup" : null,
          };
        }
        // UPDATE
        if (r.productId) return { action };
        const top = r.suggestions[0];
        if (!top) return { action };
        return {
          action,
          productId: top.id,
          matchedBy: "suggestion",
          confirmed: false,
          current: { name: top.name, skuCode: top.skuCode, dealer: top.dealer, mrp: top.mrp, gstPct: top.gstPct, stockQty: top.stockQty, archived: top.archived },
          mrp: r.invoiceMrp ?? (r.mrpSource === "manual" ? r.mrp : top.mrp),
          mrpSource: r.invoiceMrp !== null ? "invoice" : r.mrpSource === "manual" ? "manual" : "current",
        };
      }),
    [updateRow, markupPct],
  );

  // ── Cells (shared by the desktop table and phone cards) ──

  const renderItem = useCallback(
    (r: ReviewRow) => (
      <div className="min-w-0 space-y-1">
        <p className="text-sm leading-snug font-medium">{r.description}</p>
        <p className="text-xs text-muted-foreground">
          {r.quantity !== null ? <span className="font-mono">{r.quantity} × </span> : null}
          {r.rate !== null ? <span className="font-mono">{formatINR(r.rate)}</span> : null}
          {r.discountPct ? <span className="font-mono"> − {r.discountPct}%</span> : null}
          {r.hsnCode ? <span> · HSN {r.hsnCode}</span> : null}
        </p>
        {r.action === "UPDATE" && r.current ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {r.productId ? (
              <Link href={`/products/${r.productId}`} target="_blank" className="font-medium text-primary hover:underline">
                <ArrowRight className="mr-1 inline size-3 text-muted-foreground" />
                {r.current.name}
              </Link>
            ) : null}
            <span className="font-mono text-muted-foreground">{r.current.skuCode}</span>
            {r.matchedBy === "suggestion" && !r.confirmed ? (
              <Badge variant="warning" className="h-4 px-1.5 text-[10px]">
                {Math.round((r.suggestions.find((s) => s.id === r.productId)?.score ?? 0) * 100)}% similar
              </Badge>
            ) : (
              <MatchLabel by={r.matchedBy} confirmed={r.confirmed} />
            )}
          </div>
        ) : null}
        {r.action === "CREATE" ? (
          <p className="flex items-center gap-1.5 text-xs text-info-foreground">
            <PackagePlus className="size-3.5" /> New: <span className="font-medium">{r.name || "name needed"}</span>
          </p>
        ) : null}
        {editable && r.action === "UPDATE" && r.matchedBy === "suggestion" && !r.confirmed ? (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            <SmallButton onClick={() => updateRow(r.key, { confirmed: true })} className="border-success/40 text-success-foreground">
              <Check data-icon="inline-start" /> Yes, this product
            </SmallButton>
            <ProductPicker initialQuery={r.brand ? `${r.brand} ${r.modelNumber ?? ""}`.trim() : r.description} onPick={(p) => pick(r.key, p)} trigger={<SmallButton><Replace data-icon="inline-start" /> Another</SmallButton>} />
            <SmallButton onClick={() => setAction(r.key, "CREATE")}>
              <PackagePlus data-icon="inline-start" /> It&apos;s new
            </SmallButton>
          </div>
        ) : null}
      </div>
    ),
    [editable, pick, setAction, updateRow],
  );

  const renderDealer = useCallback(
    (r: ReviewRow) =>
      editable && r.action !== "SKIP" ? (
        <div className="w-32 space-y-0.5">
          <MoneyInput
            label={`Dealer price for line ${r.lineNo}`}
            value={r.dealer}
            invalid={r.dealer === null}
            onCommit={(v) => updateRow(r.key, { dealer: v, dealerBasis: "manual" })}
          />
          {r.action === "UPDATE" ? <Was from={r.current?.dealer} to={r.dealer} /> : null}
          {r.mathMismatch && r.dealerBasis !== "manual" ? (
            <span className="flex items-center gap-1 text-[11px] text-warning-foreground">
              <AlertTriangle className="size-3" /> bill maths differs
            </span>
          ) : null}
        </div>
      ) : (
        <div className="text-right">
          <span className="font-mono text-sm">{formatINR(r.dealer)}</span>
          {r.action === "UPDATE" ? <Was from={r.current?.dealer} to={r.dealer} /> : null}
        </div>
      ),
    [editable, updateRow],
  );

  const renderMrp = useCallback(
    (r: ReviewRow) => {
      const landing = r.dealer !== null ? landingPaise(r.dealer, r.gstPct) : null;
      const markup = markupPct !== null && landing !== null ? suggestMrp(landing, markupPct) : null;
      return editable && r.action !== "SKIP" ? (
        <div className="w-32 space-y-0.5">
          <MoneyInput label={`MRP for line ${r.lineNo}`} value={r.mrp} invalid={r.mrp === null} onCommit={(v) => updateRow(r.key, { mrp: v, mrpSource: "manual" })} />
          {r.action === "UPDATE" ? <Was from={r.current?.mrp} to={r.mrp} /> : null}
          <span className="block text-[11px] text-muted-foreground">
            {r.mrpSource === "invoice" ? "printed on bill" : r.mrpSource === "current" ? "current MRP kept" : r.mrpSource === "markup" ? `+${markupPct}% suggestion` : r.mrpSource === "manual" ? "typed by you" : "not on bill"}
          </span>
          <div className="flex flex-wrap gap-1">
            {r.action === "UPDATE" && r.current && r.mrp !== r.current.mrp ? (
              <button type="button" className="text-[11px] font-medium text-primary hover:underline" onClick={() => updateRow(r.key, { mrp: r.current!.mrp, mrpSource: "current" })}>
                Keep {formatINR(r.current.mrp)}
              </button>
            ) : null}
            {markup !== null && r.mrp !== markup && r.action === "CREATE" ? (
              <button type="button" className="text-[11px] font-medium text-primary hover:underline" onClick={() => updateRow(r.key, { mrp: markup, mrpSource: "markup" })}>
                Use {formatINR(markup)}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="text-right">
          <span className="font-mono text-sm text-success">{formatINR(r.mrp)}</span>
          {r.action === "UPDATE" ? <Was from={r.current?.mrp} to={r.mrp} /> : null}
        </div>
      );
    },
    [editable, markupPct, updateRow],
  );


  const renderAction = useCallback(
    (r: ReviewRow) =>
      editable ? (
        <ToggleGroup value={[r.action]} onValueChange={(v) => v[0] && setAction(r.key, v[0] as ReviewRow["action"])} variant="outline" size="sm" className="flex-nowrap">
          <ToggleGroupItem value="UPDATE" className="px-2 text-xs data-pressed:border-primary data-pressed:bg-accent data-pressed:text-accent-foreground" aria-label="Update existing product" disabled={!r.productId && r.suggestions.length === 0}>
            Update
          </ToggleGroupItem>
          <ToggleGroupItem value="CREATE" className="px-2 text-xs data-pressed:border-info data-pressed:bg-info-soft data-pressed:text-info-foreground" aria-label="Add as new product">
            New
          </ToggleGroupItem>
          <ToggleGroupItem value="SKIP" className="px-2 text-xs data-pressed:bg-muted" aria-label="Skip this line">
            Skip
          </ToggleGroupItem>
        </ToggleGroup>
      ) : (
        <span className="text-xs text-muted-foreground">{r.action === "UPDATE" ? "Updated" : r.action === "CREATE" ? "Added" : "Skipped"}</span>
      ),
    [editable, setAction],
  );

  const columns = useMemo(
    () => [
      column.display({ id: "status", header: "Status", cell: ({ row }) => <RowStatusBadge status={rowStatus(row.original)} /> }),
      column.display({ id: "item", header: "Invoice line → product", cell: ({ row }) => renderItem(row.original) }),
      column.display({ id: "dealer", header: "Dealer ex GST", cell: ({ row }) => renderDealer(row.original) }),
      column.display({ id: "mrp", header: "MRP", cell: ({ row }) => renderMrp(row.original) }),
      column.display({ id: "margin", header: "Margin", cell: ({ row }) => renderMargin(row.original) }),
      column.display({ id: "action", header: "Action", cell: ({ row }) => renderAction(row.original) }),
      column.display({
        id: "expand",
        header: "",
        cell: ({ row }) => (
          <Button variant="ghost" size="icon-sm" onClick={row.getToggleExpandedHandler()} aria-label={row.getIsExpanded() ? "Hide details" : "Show details"} aria-expanded={row.getIsExpanded()}>
            <ChevronDown className={cn("transition-transform", row.getIsExpanded() && "rotate-180")} />
          </Button>
        ),
      }),
    ],
    [renderItem, renderDealer, renderMrp, renderAction],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getRowId: (r) => r.key,
    state: { expanded },
    onExpandedChange: setExpanded,
    getRowCanExpand: () => true,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  });

  const renderDetails = (r: ReviewRow) => (
    <div className="clay-well grid gap-4 rounded-xl p-4 md:grid-cols-[1fr_16rem]">
      <div className="space-y-3">
        {r.action === "CREATE" ? (
          <>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">New product details</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["name", "Name", "sm:col-span-2"],
                  ["brand", "Brand", ""],
                  ["modelNumber", "Model number", ""],
                  ["category", "Category", ""],
                  ["hsnCode", "HSN", ""],
                  ["barcode", "Barcode", ""],
                ] as const
              ).map(([field, label, span]) => (
                <label key={field} className={cn("space-y-1", span)}>
                  <span className="text-xs font-medium">{label}</span>
                  <Input
                    disabled={!editable}
                    className={cn("h-9", (field === "modelNumber" || field === "hsnCode" || field === "barcode") && "font-mono")}
                    value={(r[field] as string | null) ?? ""}
                    onChange={(e) => updateRow(r.key, { [field]: field === "name" ? e.target.value : e.target.value || null })}
                  />
                </label>
              ))}
            </div>
          </>
        ) : r.current ? (
          <>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Product now</p>
            <p className="text-sm font-medium">{r.current.name}</p>
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Dealer</dt>
                <dd className="font-mono">{formatINR(r.current.dealer)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">MRP</dt>
                <dd className="font-mono">{formatINR(r.current.mrp)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Stock</dt>
                <dd className="font-mono">{r.current.stockQty}</dd>
              </div>
            </dl>
            {editable ? (
              <ProductPicker initialQuery={r.description} onPick={(p) => pick(r.key, p)} trigger={<SmallButton><Replace data-icon="inline-start" /> Match a different product</SmallButton>} />
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">This line is skipped and won&apos;t change anything.</p>
        )}
        {editable && r.suggestions.length > 0 && r.action !== "SKIP" ? (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Similar products</p>
            <div className="flex flex-wrap gap-1.5">
              {r.suggestions.map((s) => (
                <SmallButton
                  key={s.id}
                  onClick={() => pick(r.key, { id: s.id, snapshot: { name: s.name, skuCode: s.skuCode, dealer: s.dealer, mrp: s.mrp, gstPct: s.gstPct, stockQty: s.stockQty, archived: s.archived } })}
                  className={cn(r.productId === s.id && r.confirmed && "border-primary bg-accent")}
                >
                  {s.name.slice(0, 42)} <span className="text-muted-foreground">{Math.round(s.score * 100)}%</span>
                </SmallButton>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="space-y-2 text-sm">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">From the bill</p>
        <dl className="space-y-1">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Taxable (printed)</dt>
            <dd className="font-mono">{formatINR(r.printedTaxable)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Rate × qty − disc.</dt>
            <dd className="font-mono">{formatINR(r.expectedTaxable)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">GST</dt>
            <dd className="font-mono">{r.gstPct}%</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Landing / unit</dt>
            <dd className="font-mono">{r.dealer !== null ? formatINR(landingPaise(r.dealer, r.gstPct)) : "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Dealer price from</dt>
            <dd>{{ taxable: "taxable ÷ qty", computed: "rate − discount", rate: "rate", none: "—", manual: "typed by you" }[r.dealerBasis]}</dd>
          </div>
        </dl>
      </div>
    </div>
  );

  // ── Totals check: do the lines add up to the printed taxable total? ──
  const linesTaxable = rows.reduce((sum, r) => sum + (r.printedTaxable ?? r.expectedTaxable ?? (r.dealer && r.quantity ? r.dealer * r.quantity : 0)), 0);
  const totalsOff = header.taxableTotal !== null && Math.abs(linesTaxable - header.taxableTotal) > 100;
  const blocking = issues.size;

  const doConfirm = () =>
    startTransition(async () => {
      const res = await confirmInvoice(scanId, { header, rows });
      if (res.ok) {
        setConfirmOpen(false);
        toast.success(`Done: ${res.priceChanges} price changes, ${res.created} new products${res.skipped ? `, ${res.skipped} skipped` : ""}.`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });

  const scrollToFirstIssue = () => {
    const first = rows.find((r) => issues.has(r.key));
    if (first) {
      setExpanded((e) => (typeof e === "boolean" ? e : { ...e, [first.key]: true }));
      // Table row or card, whichever layout is showing.
      const target = [document.getElementById(`line-${first.key}`), document.getElementById(`card-${first.key}`)].find(
        (el) => el && el.offsetParent !== null,
      );
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const headerFields = (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {(
        [
          ["supplierName", "Supplier", ""],
          ["supplierGstin", "Supplier GSTIN", "font-mono uppercase"],
          ["invoiceNumber", "Invoice no.", "font-mono"],
          ["invoiceDate", "Invoice date", ""],
        ] as const
      ).map(([field, label, cls]) => (
        <label key={field} className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          {editable ? (
            <Input
              type={field === "invoiceDate" ? "date" : "text"}
              className={cn("h-9", cls)}
              value={header[field] ?? ""}
              onChange={(e) => setHeader((h) => ({ ...h, [field]: e.target.value || null }))}
            />
          ) : (
            <p className={cn("text-sm font-medium", cls)}>
              {field === "invoiceDate" && header.invoiceDate ? formatDate(`${header.invoiceDate}T12:00:00+05:30`) : (header[field] ?? "—")}
            </p>
          )}
        </label>
      ))}
    </div>
  );

  const linesPanel = (
    <div className="@container space-y-4">
      {/* Counts */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="warning">{counts.changed} price changes</Badge>
        <Badge variant="info">{counts.new} new</Badge>
        <Badge variant="success">{counts.same} same</Badge>
        {counts.review ? <Badge variant="outline" className="border-warning/50 text-warning-foreground">{counts.review} to check</Badge> : null}
        {counts.skip ? <Badge variant="muted">{counts.skip} skipped</Badge> : null}
        {editable ? (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            {save.state === "saving" ? (
              <>
                <Spinner className="size-3" /> Saving…
              </>
            ) : save.state === "saved" ? (
              <>
                <CloudCheck className="size-3.5" /> Draft saved
              </>
            ) : save.state === "error" ? (
              <span className="text-destructive">Not saved</span>
            ) : (
              "Edits save automatically"
            )}
          </span>
        ) : null}
      </div>

      {/* Desktop table */}
      <div className="clay-card hidden overflow-hidden rounded-2xl @[58rem]:block">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-surface/60 hover:bg-surface/60">
                {hg.headers.map((h) => (
                  <TableHead key={h.id} className={cn(h.id === "status" && "pl-4", h.id === "expand" && "w-10 pr-3", (h.id === "dealer" || h.id === "mrp") && "text-right")}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => {
              const r = row.original;
              const rowIssues = issues.get(r.key) ?? [];
              const warns = rowWarnings(r);
              return (
                <Fragment key={row.id}>
                  <TableRow id={`line-${r.key}`} className={cn("align-top", r.action === "SKIP" && "opacity-55", rowIssues.length && "bg-destructive/[0.03]")}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className={cn("py-3 whitespace-normal", cell.column.id === "status" && "pl-4", cell.column.id === "expand" && "pr-3", cell.column.id === "item" && "max-w-[22rem]")}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        {cell.column.id === "item" && (rowIssues.length || warns.length) ? (
                          <div className="mt-2">
                            <IssueList issues={rowIssues} warnings={warns} />
                          </div>
                        ) : null}
                      </TableCell>
                    ))}
                  </TableRow>
                  {row.getIsExpanded() ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={row.getVisibleCells().length} className="px-4 pt-0 pb-4 whitespace-normal">
                        {renderDetails(r)}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Cards whenever the panel is narrower than the table needs (phones, and beside the bill on laptops) */}
      <ul className="space-y-3 @[58rem]:hidden">
        {table.getRowModel().rows.map((row) => {
          const r = row.original;
          const rowIssues = issues.get(r.key) ?? [];
          const warns = rowWarnings(r);
          return (
            <li key={row.id} id={`card-${r.key}`} className={cn("clay-card space-y-3 rounded-2xl p-4", r.action === "SKIP" && "opacity-60", rowIssues.length && "ring-2 ring-destructive/30")}>
              <div className="flex items-start justify-between gap-2">
                <RowStatusBadge status={rowStatus(r)} />
                <span className="font-mono text-xs text-muted-foreground">Line {r.lineNo}</span>
              </div>
              {renderItem(r)}
              <IssueList issues={rowIssues} warnings={warns} />
              <div className="flex flex-wrap items-start gap-4">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Dealer ex GST</p>
                  {renderDealer(r)}
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">MRP</p>
                  {renderMrp(r)}
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Margin</p>
                  {renderMargin(r)}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {renderAction(r)}
                <Button variant="ghost" size="sm" onClick={row.getToggleExpandedHandler()}>
                  Details <ChevronDown data-icon="inline-end" className={cn("transition-transform", row.getIsExpanded() && "rotate-180")} />
                </Button>
              </div>
              {row.getIsExpanded() ? renderDetails(r) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <div className="space-y-5 pb-28">
      {/* Banners */}
      {committed ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success-soft p-4 text-sm text-success-foreground">
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="size-4" /> Confirmed{committed.by ? ` by ${committed.by}` : ""}. {counts.changed} prices changed, {counts.new} products added.
          </p>
          <Link href="/admin/history?source=INVOICE_OCR" className={buttonVariants({ variant: "outline", size: "sm" })}>
            See price history
          </Link>
        </div>
      ) : null}
      {isMock ? (
        <div className="flex gap-3 rounded-xl border border-info/25 bg-info-soft p-4 text-sm text-info-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            <span className="font-medium">Demo extraction.</span> No Gemini key is set, so these lines are sample data, not read from your file.
            Matching, review and saving below are real.
          </p>
        </div>
      ) : null}
      {warnings.length ? (
        <div className="rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning-foreground">
          <p className="flex items-center gap-2 font-medium">
            <AlertTriangle className="size-4" /> Notes from the AI
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-6">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Header */}
      <section className="clay-card space-y-3 rounded-2xl p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="size-4 text-muted-foreground" /> Invoice
          </h2>
          <p className="text-xs text-muted-foreground">
            Grand total <span className="font-mono font-medium text-foreground">{formatINR(header.grandTotal)}</span>
            {header.taxableTotal !== null ? (
              <>
                {" "}
                · taxable <span className="font-mono font-medium text-foreground">{formatINR(header.taxableTotal)}</span>
              </>
            ) : null}
          </p>
        </div>
        {headerFields}
        {totalsOff ? (
          <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning-foreground">
            <AlertTriangle className="mt-px size-3.5 shrink-0" />
            The lines add up to {formatINR(linesTaxable)} but the invoice&apos;s taxable total is {formatINR(header.taxableTotal)}. A line may have been
            missed or misread; compare with the bill.
          </p>
        ) : null}
      </section>

      {/* Bill beside the lines on wide screens; on phones the bill opens full screen. Lines render once. */}
      <div className="gap-5 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="sticky top-[4.5rem] hidden h-[calc(100dvh-6rem)] self-start lg:block">
          <InvoiceViewer scanId={scanId} files={files} className="size-full" />
        </div>
        <div className="min-w-0 space-y-3">
          <Button variant="outline" className="w-full lg:hidden" onClick={() => setBillOpen(true)}>
            <FileText data-icon="inline-start" /> View the bill
            <span className="text-muted-foreground">
              · {files.length} {files.length === 1 ? "page" : "pages"}
            </span>
          </Button>
          {linesPanel}
        </div>
      </div>
      {billOpen ? (
        <div role="dialog" aria-modal="true" aria-label="Invoice pages" className="fixed inset-0 z-[60] flex flex-col bg-background lg:hidden">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <ListChecks className="size-4" /> {header.supplierName ?? "Invoice"}
            </p>
            <Button variant="ghost" size="icon" onClick={() => setBillOpen(false)} aria-label="Close the bill">
              <X />
            </Button>
          </div>
          <InvoiceViewer scanId={scanId} files={files} className="m-3 flex-1 rounded-xl" />
        </div>
      ) : null}

      {/* Action bar */}
      {editable || canDiscard ? (
        <div className="glass fixed inset-x-0 bottom-[calc(4.5rem+max(0.75rem,env(safe-area-inset-bottom)))] z-30 border-y [--glass-alpha:90%] border-(--clay-edge) shadow-clay md:bottom-0 md:border-b-0 md:left-(--sidebar-width) print:hidden">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
            <div className="text-sm">
              {editable ? (
                blocking > 0 ? (
                  <button type="button" onClick={scrollToFirstIssue} className="flex items-center gap-2 font-medium text-destructive hover:underline">
                    <AlertTriangle className="size-4" /> {blocking} {blocking === 1 ? "line needs" : "lines need"} attention
                  </button>
                ) : (
                  <span className="flex items-center gap-2 font-medium text-success-foreground">
                    <CheckCircle2 className="size-4" /> Ready to confirm
                  </span>
                )
              ) : (
                <span className="text-muted-foreground">Waiting for an admin to review.</span>
              )}
            </div>
            <div className="flex gap-2">
              {canDiscard ? (
                <Button variant="ghost" onClick={() => setDiscardOpen(true)} disabled={pending}>
                  <Trash2 data-icon="inline-start" /> Discard
                </Button>
              ) : null}
              {editable ? (
                <Button onClick={() => (blocking > 0 ? scrollToFirstIssue() : setConfirmOpen(true))} disabled={pending}>
                  <Check data-icon="inline-start" /> Confirm &amp; update prices
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm this invoice?</AlertDialogTitle>
            <AlertDialogDescription>These changes are saved and recorded in the price history.</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between rounded-lg bg-warning-soft px-3 py-2 text-warning-foreground">
              <span className="flex items-center gap-2"><Pencil className="size-4" /> Price changes</span>
              <span className="font-mono font-semibold">{counts.changed}</span>
            </li>
            <li className="flex items-center justify-between rounded-lg bg-info-soft px-3 py-2 text-info-foreground">
              <span className="flex items-center gap-2"><PackagePlus className="size-4" /> New products</span>
              <span className="font-mono font-semibold">{counts.new}</span>
            </li>
            <li className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-muted-foreground">
              <span className="flex items-center gap-2"><CheckCircle2 className="size-4" /> Same price (wording remembered)</span>
              <span className="font-mono font-semibold">{counts.same}</span>
            </li>
            {counts.skip ? (
              <li className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-muted-foreground">
                <span className="flex items-center gap-2"><SkipForward className="size-4" /> Skipped</span>
                <span className="font-mono font-semibold">{counts.skip}</span>
              </li>
            ) : null}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
            <AlertDialogAction onClick={doConfirm} disabled={pending}>
              {pending ? <Spinner /> : <Check data-icon="inline-start" />} Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this invoice?</AlertDialogTitle>
            <AlertDialogDescription>No prices change. The uploaded pages are deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
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
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
