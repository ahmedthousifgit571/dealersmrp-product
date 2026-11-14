"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { History, PackageSearch, ScanBarcode, Search, X } from "lucide-react";
import { useScanner } from "@/components/scanner/scanner-provider";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import type { ProductHit } from "@/lib/products/queries";
import { cn } from "@/lib/utils";
import { ProductCard, ProductCardSkeleton } from "./product-card";

type Stats = { products: number; brands: number; changes7d: number };
type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; query: string; results: ProductHit[]; ms: number }
  | { status: "error"; message: string };

const RECENT_KEY = "ep:recent-searches";
const DEBOUNCE_MS = 150;
const number = new Intl.NumberFormat("en-IN");

// Recent searches live in this device's localStorage (a per-person convenience only).
const EMPTY: string[] = [];
const recentListeners = new Set<() => void>();
let recentCache: string[] | null = null;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string").slice(0, 6) : [];
  } catch {
    return [];
  }
}

const recentStore = {
  subscribe(listener: () => void) {
    recentListeners.add(listener);
    return () => recentListeners.delete(listener);
  },
  getSnapshot() {
    recentCache ??= readRecent();
    return recentCache;
  },
  push(query: string) {
    const next = [query, ...recentStore.getSnapshot().filter((q) => q.toLowerCase() !== query.toLowerCase())].slice(0, 6);
    recentCache = next;
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // Private mode or storage blocked: keep the in-memory list only.
    }
    recentListeners.forEach((l) => l());
  },
};

export function PriceFinder({ initialRecent, stats }: { initialRecent: ProductHit[]; stats: Stats }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { openScanner, lookupCode } = useScanner();
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const recentQueries = useSyncExternalStore(recentStore.subscribe, recentStore.getSnapshot, () => EMPTY);
  const [now, setNow] = useState(() => new Date());
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const trimmed = q.trim();
    const url = new URL(window.location.href);
    if (trimmed) url.searchParams.set("q", trimmed);
    else url.searchParams.delete("q");
    window.history.replaceState(null, "", url);

    if (!trimmed) {
      setState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setState((s) => (s.status === "done" ? s : { status: "loading" }));
    const started = performance.now();
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      });
      if (res.status === 401) {
        router.replace("/auth/session-ended");
        return;
      }
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const data = (await res.json()) as { results: ProductHit[] };
      setNow(new Date());
      setState({ status: "done", query: trimmed, results: data.results, ms: performance.now() - started });
      if (data.results.length > 0) recentStore.push(trimmed);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState({ status: "error", message: "Couldn't reach the server. Check the connection and try again." });
    }
  }, [router]);

  // Debounced search as the user types.
  useEffect(() => {
    const id = window.setTimeout(() => void runSearch(query), query.trim() ? DEBOUNCE_MS : 0);
    return () => window.clearTimeout(id);
  }, [query, runSearch]);

  // "/" focuses the search box from anywhere on the page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) && !target.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isSearching = query.trim().length > 0;
  const fetching = state.status === "loading" || (state.status === "done" && state.query !== query.trim() && isSearching);
  const results = state.status === "done" ? state.results : [];

  const heading = useMemo(() => {
    if (!isSearching) return { title: "Recently updated", detail: "Latest prices first" };
    if (state.status === "done") {
      const n = state.results.length;
      return {
        title: n === 0 ? "No matches" : `${n}${n === 20 ? "+" : ""} ${n === 1 ? "product" : "products"}`,
        detail: `for “${state.query}” · ${Math.round(state.ms)} ms`,
      };
    }
    return { title: "Searching…", detail: "" };
  }, [isSearching, state]);

  return (
    <div className="space-y-6">
      {/* Search */}
      <section className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
              if (e.key === "Enter") {
                const trimmed = query.trim();
                const exact = state.status === "done" && state.query === trimmed ? state.results.filter((r) => r.match === "exact") : [];
                if (exact.length === 1) router.push(`/products/${exact[0]!.id}`);
                // A code with no spaces (typed, pasted or from a USB scanner): look it up directly.
                else if (/^[A-Za-z0-9-]{6,}$/.test(trimmed)) lookupCode(trimmed);
                else void runSearch(query);
              }
            }}
            placeholder="Name, model, SKU or barcode"
            aria-label="Search products"
            className="clay-card h-14 w-full rounded-[1.25rem] pr-32 pl-12 text-base transition-[box-shadow,border-color] outline-none placeholder:text-muted-foreground/80 focus-visible:border-primary/50 focus-visible:ring-4 focus-visible:ring-primary/15 md:h-16 md:text-lg [&::-webkit-search-cancel-button]:hidden"
          />
          <div className="absolute top-1/2 right-3 flex -translate-y-1/2 items-center gap-2">
            {fetching ? <Spinner className="text-muted-foreground" /> : null}
            {query ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
              >
                <X />
              </Button>
            ) : (
              <Kbd className="hidden md:inline-flex">/</Kbd>
            )}
            <Button variant="secondary" size="lg" onClick={openScanner} aria-label="Scan a barcode" className="h-10 gap-2 rounded-xl px-3">
              <ScanBarcode />
              <span className="hidden sm:inline">Scan</span>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span>
            <span className="font-mono font-medium text-foreground">{number.format(stats.products)}</span> products
          </span>
          <span>
            <span className="font-mono font-medium text-foreground">{number.format(stats.brands)}</span> brands
          </span>
          <span>
            <span className="font-mono font-medium text-foreground">{number.format(stats.changes7d)}</span> price changes
            this week
          </span>
        </div>

        {!isSearching && recentQueries.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <History className="size-3.5 text-muted-foreground" aria-hidden />
            {recentQueries.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuery(q)}
                className="clay-raised rounded-full px-3 py-1 text-xs font-medium text-foreground/80 transition-[box-shadow,color] hover:text-primary hover:shadow-clay active:shadow-well"
              >
                {q}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {/* Results */}
      <section aria-live="polite" aria-busy={fetching} className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold">{heading.title}</h2>
          <p className="truncate text-xs text-muted-foreground">{heading.detail}</p>
        </div>

        {state.status === "error" ? (
          <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
            {state.message}{" "}
            <button type="button" className="font-medium underline" onClick={() => void runSearch(query)}>
              Try again
            </button>
          </div>
        ) : null}

        {isSearching && state.status === "loading" ? (
          <div className="space-y-3">
            <ProductCardSkeleton />
            <ProductCardSkeleton />
            <ProductCardSkeleton />
          </div>
        ) : null}

        {isSearching && state.status === "done" && results.length === 0 ? (
          <Empty className="clay-well rounded-2xl border-dashed py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageSearch />
              </EmptyMedia>
              <EmptyTitle>Nothing matches “{state.query}”</EmptyTitle>
              <EmptyDescription>
                Try fewer words, just the model number (e.g. <span className="font-mono">HS PLUS 48</span>), or the
                barcode digits on the box.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        <div className={cn("space-y-3 transition-opacity", fetching && state.status === "done" && "opacity-60")}>
          {(isSearching ? results : initialRecent).map((p) => (
            <ProductCard key={p.id} product={p} now={now} />
          ))}
        </div>

        {!isSearching && initialRecent.length === 0 ? (
          <Empty className="clay-well rounded-2xl border-dashed py-12">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageSearch />
              </EmptyMedia>
              <EmptyTitle>No products yet</EmptyTitle>
              <EmptyDescription>Products added by an admin will appear here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </section>
    </div>
  );
}
