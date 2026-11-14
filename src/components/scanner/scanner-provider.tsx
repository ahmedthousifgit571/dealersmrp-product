"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, ImageUp, Keyboard, PackagePlus, ScanBarcode, Search, X, Zap, ZapOff } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatINR } from "@/lib/money";
import type { ProductHit } from "@/lib/products/queries";
import type { Role } from "@/lib/auth/jwt";
import { cn } from "@/lib/utils";

type ScannerContextValue = {
  openScanner: () => void;
  lookupCode: (code: string) => void;
  setRole: (role: Role) => void;
};
const ScannerContext = createContext<ScannerContextValue | null>(null);

export function useScanner() {
  const ctx = useContext(ScannerContext);
  if (!ctx) throw new Error("useScanner must be used inside <ScannerProvider>");
  return ctx;
}

type Phase =
  | { kind: "starting" }
  | { kind: "scanning" }
  | { kind: "camera-error"; message: string }
  | { kind: "looking-up"; code: string }
  | { kind: "many"; code: string; results: ProductHit[] }
  | { kind: "not-found"; code: string }
  | { kind: "lookup-error"; code: string };

/**
 * Hardware scanners (USB / Bluetooth) "type" the code very fast and press Enter.
 * Detects such bursts when no text field has focus.
 */
function useWedgeScanner(onCode: (code: string) => void) {
  useEffect(() => {
    let buffer = "";
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const now = performance.now();
      if (e.key === "Enter") {
        if (buffer.length >= 6 && now - last < 120) {
          e.preventDefault();
          onCode(buffer);
        }
        buffer = "";
        return;
      }
      if (e.key.length !== 1) return;
      if (now - last > 60) buffer = "";
      buffer += e.key;
      last = now;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCode]);
}

async function fetchExact(code: string): Promise<ProductHit[] | "unauthorized"> {
  const res = await fetch(`/api/products/lookup?code=${encodeURIComponent(code)}`);
  if (res.status === 401) return "unauthorized";
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json()) as { results: ProductHit[] }).results;
}

/** Tells the scanner who is signed in (rendered from a session-aware Suspense slot). */
export function ScannerRole({ role }: { role: Role }) {
  const { setRole } = useScanner();
  useEffect(() => setRole(role), [role, setRole]);
  return null;
}

export function ScannerProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [role, setRole] = useState<Role>("STAFF");
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });

  const resolve = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;
      navigator.vibrate?.(40);
      setOpen(true);
      setPhase({ kind: "looking-up", code });
      try {
        const results = await fetchExact(code);
        if (results === "unauthorized") {
          router.replace("/auth/session-ended");
          return;
        }
        if (results.length === 1) {
          setOpen(false);
          router.push(`/products/${results[0]!.id}`);
        } else if (results.length > 1) {
          setPhase({ kind: "many", code, results });
        } else {
          setPhase({ kind: "not-found", code });
        }
      } catch {
        setPhase({ kind: "lookup-error", code });
      }
    },
    [router],
  );

  useWedgeScanner(resolve);

  // PWA shortcut: /?scan=1 opens the scanner straight away.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("scan") !== "1") return;
    url.searchParams.delete("scan");
    window.history.replaceState(null, "", url);
    const id = window.setTimeout(() => {
      setPhase({ kind: "starting" });
      setOpen(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const openScanner = useCallback(() => {
    setPhase({ kind: "starting" });
    setOpen(true);
  }, []);

  return (
    <ScannerContext.Provider value={{ openScanner, lookupCode: resolve, setRole }}>
      {children}
      {open ? (
        <ScannerOverlay
          role={role}
          phase={phase}
          setPhase={setPhase}
          onCode={resolve}
          onClose={() => setOpen(false)}
          onPick={(id) => {
            setOpen(false);
            router.push(`/products/${id}`);
          }}
        />
      ) : null}
    </ScannerContext.Provider>
  );
}

function ScannerOverlay({
  role,
  phase,
  setPhase,
  onCode,
  onClose,
  onPick,
}: {
  role: Role;
  phase: Phase;
  setPhase: (p: Phase) => void;
  onCode: (code: string) => void;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const regionId = `scan-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const fileRegionId = `${regionId}-file`;
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({ supported: false, on: false });
  const [manual, setManual] = useState("");
  const [showManual, setShowManual] = useState(false);
  const cameraWanted = phase.kind === "starting" || phase.kind === "scanning";
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  // Camera lifecycle. Starts when the overlay is in a scanning phase, stops otherwise.
  useEffect(() => {
    if (!cameraWanted) return;
    let cancelled = false;
    let scanner: Html5Qrcode | null = null;
    let started: Promise<unknown> = Promise.resolve();

    void (async () => {
      const { Html5Qrcode, Html5QrcodeSupportedFormats: F } = await import("html5-qrcode");
      if (cancelled) return;
      scanner = new Html5Qrcode(regionId, {
        verbose: false,
        useBarCodeDetectorIfSupported: true,
        formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E, F.CODE_128, F.CODE_39, F.ITF, F.QR_CODE],
      });
      scannerRef.current = scanner;
      let handled = false;
      started = scanner.start(
        { facingMode: "environment" },
        {
          fps: 12,
          qrbox: (w, h) => ({ width: Math.round(Math.min(w * 0.86, 420)), height: Math.round(Math.min(h * 0.42, 200)) }),
          videoConstraints: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
        },
        (text) => {
          if (handled) return;
          handled = true;
          onCodeRef.current(text);
        },
        () => {},
      );
      try {
        await started;
        if (cancelled) return;
        setPhase({ kind: "scanning" });
        try {
          const caps = scanner.getRunningTrackCapabilities() as MediaTrackCapabilities & { torch?: boolean };
          setTorch({ supported: !!caps.torch, on: false });
        } catch {
          setTorch({ supported: false, on: false });
        }
      } catch (err) {
        if (cancelled) return;
        // html5-qrcode sometimes rejects with a plain string, so check the name and the message.
        const name = `${(err as { name?: string })?.name ?? ""} ${(err as { message?: string })?.message ?? String(err)}`;
        setPhase({
          kind: "camera-error",
          message: /NotAllowed|Permission/i.test(name)
            ? "Camera permission was refused. Allow camera access for this site in the browser settings, or type the code."
            : /NotFound|Overconstrained/i.test(name)
              ? "No camera was found on this device. Scan from a photo or type the code instead."
              : "The camera couldn't start. The browser only allows it on https:// or localhost.",
        });
      }
    })();

    return () => {
      cancelled = true;
      const s = scanner;
      scannerRef.current = null;
      if (s) {
        started
          .catch(() => undefined)
          .then(() => (s.isScanning ? s.stop() : undefined))
          .then(() => s.clear())
          .catch(() => undefined);
      }
    };
    // setPhase is a stable state setter from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraWanted, regionId]);

  // Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggleTorch = async () => {
    const s = scannerRef.current;
    if (!s) return;
    try {
      await s.applyVideoConstraints({ advanced: [{ torch: !torch.on } as MediaTrackConstraintSet] });
      setTorch((t) => ({ ...t, on: !t.on }));
    } catch {
      setTorch({ supported: false, on: false });
    }
  };

  const scanPhoto = async (file: File) => {
    const { Html5Qrcode } = await import("html5-qrcode");
    const fileScanner = new Html5Qrcode(fileRegionId, { verbose: false });
    try {
      const text = await fileScanner.scanFile(file, false);
      onCode(text);
    } catch {
      setPhase({ kind: "camera-error", message: "No barcode found in that photo. Try a sharper, closer picture." });
    } finally {
      fileScanner.clear();
    }
  };

  const statusLine = (() => {
    switch (phase.kind) {
      case "starting":
        return "Starting camera…";
      case "scanning":
        return "Point at the barcode on the box. It scans by itself.";
      case "looking-up":
        return `Looking up ${phase.code}…`;
      default:
        return "";
    }
  })();

  return (
    <div role="dialog" aria-modal="true" aria-label="Barcode scanner" className="fixed inset-0 z-[60] flex flex-col bg-zinc-950 text-white">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/10">
            <ScanBarcode className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">Scan a product</p>
            <p className="text-xs text-white/55">Barcode, QR or SKU label</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {torch.supported && phase.kind === "scanning" ? (
            <button
              type="button"
              onClick={toggleTorch}
              aria-label={torch.on ? "Turn torch off" : "Turn torch on"}
              className="flex size-10 items-center justify-center rounded-xl bg-white/10 active:bg-white/20"
            >
              {torch.on ? <ZapOff className="size-5" /> : <Zap className="size-5" />}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="flex size-10 items-center justify-center rounded-xl bg-white/10 active:bg-white/20"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* Viewfinder */}
      <div className="relative mx-4 flex flex-1 items-center justify-center overflow-hidden rounded-3xl bg-black ring-1 ring-white/10">
        <div id={regionId} className={cn("size-full [&_video]:size-full [&_video]:object-cover", !cameraWanted && "hidden")} />
        <div id={fileRegionId} className="hidden" />

        {cameraWanted ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <div className="relative h-[34%] max-h-52 w-[86%] max-w-[420px]">
              <span className="absolute top-0 left-0 size-8 rounded-tl-2xl border-t-4 border-l-4 border-white" />
              <span className="absolute top-0 right-0 size-8 rounded-tr-2xl border-t-4 border-r-4 border-white" />
              <span className="absolute bottom-0 left-0 size-8 rounded-bl-2xl border-b-4 border-l-4 border-white" />
              <span className="absolute right-0 bottom-0 size-8 rounded-br-2xl border-r-4 border-b-4 border-white" />
              <span className="absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 animate-pulse rounded bg-emerald-400/90 shadow-[0_0_16px] shadow-emerald-400" />
            </div>
          </div>
        ) : null}

        {phase.kind === "starting" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70">
            <Camera className="size-8" />
            <Spinner />
          </div>
        ) : null}

        {phase.kind === "looking-up" ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <Spinner className="size-6" />
            <p className="font-mono text-lg">{phase.code}</p>
            <p className="text-sm text-white/60">Finding the product…</p>
          </div>
        ) : null}

        {phase.kind === "camera-error" ? (
          <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-white/10">
              <CameraOff className="size-7" />
            </span>
            <p className="text-base font-medium">Camera unavailable</p>
            <p className="text-sm text-white/65">{phase.message}</p>
            <Button variant="secondary" className="mt-1" onClick={() => setPhase({ kind: "starting" })}>
              Try the camera again
            </Button>
          </div>
        ) : null}

        {phase.kind === "not-found" || phase.kind === "lookup-error" ? (
          <div className="flex max-w-sm flex-col items-center gap-3 px-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300">
              <Search className="size-7" />
            </span>
            <p className="font-mono text-lg">{phase.code}</p>
            <p className="text-base font-medium">
              {phase.kind === "not-found" ? "No product has this code yet" : "Couldn't reach the server"}
            </p>
            <p className="text-sm text-white/65">
              {phase.kind === "not-found"
                ? "It may be a new product, or saved without its barcode."
                : "Check the connection and scan again."}
            </p>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <Button variant="secondary" onClick={() => setPhase({ kind: "starting" })}>
                <ScanBarcode data-icon="inline-start" /> Scan again
              </Button>
              {phase.kind === "not-found" && role === "ADMIN" ? (
                <Link
                  href={`/admin/products/new?barcode=${encodeURIComponent(phase.code)}`}
                  onClick={onClose}
                  className={buttonVariants({ className: "bg-white text-zinc-900 hover:bg-white/90" })}
                >
                  <PackagePlus data-icon="inline-start" /> Add as new product
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}

        {phase.kind === "many" ? (
          <div className="w-full max-w-md space-y-3 px-4">
            <p className="text-center text-sm text-white/70">
              {phase.results.length} products share <span className="font-mono">{phase.code}</span>. Pick one:
            </p>
            <ul className="space-y-2">
              {phase.results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onPick(p.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/8 p-3 text-left ring-1 ring-white/10 active:bg-white/15"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block font-mono text-xs text-white/55">{p.skuCode}</span>
                    </span>
                    <span className="font-mono text-base font-semibold text-emerald-300">{formatINR(p.mrp)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* Bottom controls */}
      <div className="space-y-3 px-4 pt-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
        {statusLine ? <p className="text-center text-sm text-white/70">{statusLine}</p> : null}
        {showManual ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.trim()) onCode(manual);
            }}
          >
            <input
              autoFocus
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              inputMode="text"
              placeholder="Barcode digits or SKU"
              className="h-12 min-w-0 flex-1 rounded-xl bg-white/10 px-4 font-mono text-base text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-white/40"
            />
            <Button type="submit" className="h-12 bg-white px-5 text-zinc-900 hover:bg-white/90">
              Find
            </Button>
          </form>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-medium active:bg-white/20">
            <ImageUp className="size-4" /> Scan from photo
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void scanPhoto(file);
              }}
            />
          </label>
          <button
            type="button"
            onClick={() => setShowManual((v) => !v)}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-medium active:bg-white/20"
          >
            <Keyboard className="size-4" /> Type the code
          </button>
        </div>
      </div>
    </div>
  );
}
