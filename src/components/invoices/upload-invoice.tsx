"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Camera,
  FileText,
  FileUp,
  Info,
  Lightbulb,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { compressImage } from "@/lib/image-compress";
import { cn } from "@/lib/utils";

type Page = { id: string; file: File; url: string | null; kind: "image" | "pdf" };
type Phase = { kind: "idle" } | { kind: "working"; label: string; progress: number } | { kind: "error"; message: string; scanId: string | null };

const MAX_PAGES = 6;
const MAX_BYTES = 4 * 1024 * 1024;
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

export function UploadInvoice({ aiReady }: { aiReady: boolean }) {
  const router = useRouter();
  const [pages, setPages] = useState<Page[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [preparing, setPreparing] = useState(false);
  const pagesRef = useRef(pages);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);
  useEffect(() => () => pagesRef.current.forEach((p) => p.url && URL.revokeObjectURL(p.url)), []);

  const addFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const incoming = [...list];
    const pdf = incoming.find((f) => f.type === "application/pdf");
    if (pdf) {
      if (pdf.size > MAX_BYTES) {
        toast.error(`That PDF is ${kb(pdf.size)}. The limit is 4 MB. Try a smaller export or photos of the pages.`);
        return;
      }
      pages.forEach((p) => p.url && URL.revokeObjectURL(p.url));
      setPages([{ id: crypto.randomUUID(), file: pdf, url: URL.createObjectURL(pdf), kind: "pdf" }]);
      if (incoming.length > 1) toast.info("A PDF is read on its own, so the other files were left out.");
      return;
    }
    if (pages.some((p) => p.kind === "pdf")) {
      toast.error("Remove the PDF first, or upload photos as a separate invoice.");
      return;
    }
    const room = MAX_PAGES - pages.length;
    if (room <= 0) {
      toast.error(`Up to ${MAX_PAGES} pages per invoice.`);
      return;
    }
    setPreparing(true);
    const added: Page[] = [];
    for (const original of incoming.filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name)).slice(0, room)) {
      const file = await compressImage(original);
      if (file.size > MAX_BYTES) {
        toast.error(`${original.name} is still ${kb(file.size)} after shrinking. Retake it closer.`);
        continue;
      }
      const previewable = file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp";
      added.push({ id: crypto.randomUUID(), file, url: previewable ? URL.createObjectURL(file) : null, kind: "image" });
    }
    setPreparing(false);
    setPages((p) => [...p, ...added]);
  };

  const move = (index: number, delta: -1 | 1) =>
    setPages((p) => {
      const next = [...p];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item!);
      return next;
    });

  const remove = (id: string) =>
    setPages((p) => {
      const gone = p.find((x) => x.id === id);
      if (gone?.url) URL.revokeObjectURL(gone.url);
      return p.filter((x) => x.id !== id);
    });

  const read = async (existingScanId: string | null = null) => {
    let scanId = existingScanId;
    try {
      if (!scanId) {
        setPhase({ kind: "working", label: "Starting…", progress: 5 });
        const res = await fetch("/api/invoices", { method: "POST" });
        if (res.status === 401) return router.replace("/auth/session-ended");
        if (!res.ok) throw new Error("Couldn't start the upload.");
        scanId = ((await res.json()) as { id: string }).id;
        for (const [i, page] of pages.entries()) {
          setPhase({ kind: "working", label: `Uploading page ${i + 1} of ${pages.length}…`, progress: 10 + (i / pages.length) * 40 });
          const body = new FormData();
          body.append("file", page.file);
          const up = await fetch(`/api/invoices/${scanId}/files`, { method: "POST", body });
          if (!up.ok) throw new Error(((await up.json().catch(() => ({}))) as { error?: string }).error ?? "Upload failed.");
        }
      }
      setPhase({ kind: "working", label: aiReady ? "Reading the invoice with AI… this can take up to a minute" : "Reading the invoice (demo data)…", progress: 60 });
      const ex = await fetch(`/api/invoices/${scanId}/extract`, { method: "POST" });
      const data = (await ex.json().catch(() => ({}))) as { error?: string };
      if (!ex.ok) {
        setPhase({ kind: "error", message: data.error ?? "The invoice couldn't be read.", scanId });
        return;
      }
      setPhase({ kind: "working", label: "Opening the review…", progress: 100 });
      router.push(`/invoices/${scanId}`);
    } catch (err) {
      setPhase({ kind: "error", message: (err as Error).message || "Something went wrong.", scanId });
    }
  };

  const working = phase.kind === "working";

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        {!aiReady ? (
          <div className="flex gap-3 rounded-xl border border-info/25 bg-info-soft p-4 text-sm text-info-foreground">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-medium">Demo mode.</span> No Gemini API key is set yet, so any upload returns a sample invoice
              built from the demo catalogue. Everything after that (matching, review, saving) works for real.
            </p>
          </div>
        ) : null}

        {/* Capture */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={cn("clay-card group flex cursor-pointer flex-col items-center gap-3 rounded-2xl p-6 text-center transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-clay-lg active:translate-y-0 active:shadow-well", working && "pointer-events-none opacity-60")}>
            <span className="orb tone-orange size-12 rounded-2xl">
              <Camera className="size-6" />
            </span>
            <span>
              <span className="block font-semibold">Take a photo</span>
              <span className="text-sm text-muted-foreground">Opens the camera on phones</span>
            </span>
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
          </label>
          <label className={cn("clay-card group flex cursor-pointer flex-col items-center gap-3 rounded-2xl p-6 text-center transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-clay-lg active:translate-y-0 active:shadow-well", working && "pointer-events-none opacity-60")}>
            <span className="orb tone-teal size-12 rounded-2xl">
              <FileUp className="size-6" />
            </span>
            <span>
              <span className="block font-semibold">Upload PDF or images</span>
              <span className="text-sm text-muted-foreground">One PDF, or up to {MAX_PAGES} page photos</span>
            </span>
            <input type="file" accept="image/*,application/pdf" multiple className="sr-only" onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
          </label>
        </div>

        {/* Pages */}
        {pages.length > 0 || preparing ? (
          <div className="clay-card rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {pages.length} {pages.length === 1 ? "page" : "pages"}
                {pages.length > 1 ? <span className="font-normal text-muted-foreground"> · in reading order</span> : null}
              </h2>
              {preparing ? (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Spinner /> Preparing photos…
                </span>
              ) : null}
            </div>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {pages.map((p, i) => (
                <li key={p.id} className="clay-well overflow-hidden rounded-xl">
                  <div className="relative aspect-[3/4] bg-muted">
                    {p.kind === "pdf" ? (
                      <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
                        <FileText className="size-10" />
                        <span className="px-2 text-center text-xs break-all">{p.file.name}</span>
                      </div>
                    ) : p.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.url} alt={`Page ${i + 1}`} className="size-full object-cover object-top" />
                    ) : (
                      <div className="flex size-full items-center justify-center text-xs text-muted-foreground">No preview (HEIC)</div>
                    )}
                    <span className="absolute top-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 font-mono text-xs text-white">{i + 1}</span>
                  </div>
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                    <span className="font-mono text-[11px] text-muted-foreground">{kb(p.file.size)}</span>
                    <span className="flex">
                      {pages.length > 1 ? (
                        <>
                          <Button variant="ghost" size="icon-sm" disabled={i === 0 || working} onClick={() => move(i, -1)} aria-label="Move earlier">
                            <ArrowLeft />
                          </Button>
                          <Button variant="ghost" size="icon-sm" disabled={i === pages.length - 1 || working} onClick={() => move(i, 1)} aria-label="Move later">
                            <ArrowRight />
                          </Button>
                        </>
                      ) : null}
                      <Button variant="ghost" size="icon-sm" disabled={working} onClick={() => remove(p.id)} aria-label="Remove page">
                        <Trash2 />
                      </Button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {phase.kind === "working" ? (
          <div className="clay-card space-y-2 rounded-2xl p-5">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Spinner /> {phase.label}
            </p>
            <Progress value={phase.progress} />
          </div>
        ) : null}

        {phase.kind === "error" ? (
          <div role="alert" className="flex flex-col gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" /> {phase.message}
            </p>
            <Button variant="outline" onClick={() => void read(phase.scanId)}>
              Retry
            </Button>
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button size="lg" className="h-11 px-5" disabled={pages.length === 0 || working || preparing} onClick={() => void read(null)}>
            <Sparkles data-icon="inline-start" /> Read invoice
          </Button>
        </div>
      </div>

      <aside className="clay-card space-y-3 rounded-2xl p-5 lg:self-start">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Lightbulb className="size-4 text-warning" /> For the best reading
        </h2>
        <ul className="space-y-2.5 text-sm text-muted-foreground">
          <li>Lay the bill flat in good light, without shadows across the table.</li>
          <li>Fit the whole item table in the frame. Take one photo per page for long bills.</li>
          <li>The supplier&apos;s PDF is the most accurate option when you have it.</li>
          <li>Nothing changes until an admin reviews the lines and confirms.</li>
        </ul>
      </aside>
    </div>
  );
}
