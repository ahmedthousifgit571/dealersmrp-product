import type { Metadata } from "next";
import { Suspense } from "react";
import { FileScan, ScanBarcode, ShieldCheck, TrendingUp } from "lucide-react";
import { BrandLockup, BrandMark } from "@/components/brand";
import { Skeleton } from "@/components/ui/skeleton";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const highlights = [
  { icon: ScanBarcode, title: "Scan or search", body: "Barcode, model number or a few letters of the name." },
  { icon: FileScan, title: "Prices from invoices", body: "Photograph a supplier bill and review the new rates." },
  { icon: TrendingUp, title: "Every change on record", body: "Old and new prices, who changed them and why." },
];

export default function LoginPage() {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel (desktop) */}
      <aside className="liquid-panel relative m-3 hidden overflow-hidden rounded-[2rem] text-white shadow-clay-lg lg:flex lg:flex-col">
        <div className="liquid-waves absolute inset-x-0 bottom-0 h-24 opacity-45" aria-hidden />
        <div
          className="absolute -top-40 -left-32 size-[34rem] rounded-full bg-[oklch(0.75_0.12_185)] opacity-30 blur-3xl"
          aria-hidden
        />
        <div
          className="absolute -right-24 -bottom-48 size-[28rem] rounded-full bg-[oklch(0.72_0.17_50)] opacity-35 blur-3xl"
          aria-hidden
        />

        <div className="relative flex flex-1 flex-col justify-between p-12 xl:p-16">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="text-lg font-semibold tracking-tight">ElectroPrice</span>
          </div>

          <div className="max-w-lg space-y-10">
            <div className="space-y-4">
              <h1 className="text-4xl leading-[1.1] font-semibold tracking-tight text-balance xl:text-[2.75rem]">
                The right price, before the customer finishes asking.
              </h1>
              <p className="text-lg text-white/70">
                Dealer price and MRP for every product in the shop, kept current from your suppliers&apos; invoices.
              </p>
            </div>

            {/* Sample lookup card */}
            <div className="rounded-3xl border border-white/25 bg-white/10 p-5 shadow-[inset_0_1px_0_oklch(1_0_0/0.35),0_24px_48px_-16px_oklch(0.15_0.05_230/0.6)] backdrop-blur-xl">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium tracking-wide text-white/50 uppercase">Crompton · HS Plus 48</p>
                  <p className="mt-1 truncate text-base font-medium">High Speed Ceiling Fan 1200 mm, Brown</p>
                  <p className="mt-1 font-mono text-xs text-white/45">ELEC-1004 · 2012345678904</p>
                </div>
                <span className="rounded-md bg-emerald-400/15 px-2 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-400/25">
                  In stock 14
                </span>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
                <div>
                  <p className="text-[11px] tracking-wide text-white/50 uppercase">MRP</p>
                  <p className="text-price mt-1 text-2xl text-emerald-300">₹3,250</p>
                </div>
                <div>
                  <p className="text-[11px] tracking-wide text-white/50 uppercase">Dealer · ex GST</p>
                  <p className="text-price mt-1 text-xl">₹2,118</p>
                </div>
                <div>
                  <p className="text-[11px] tracking-wide text-white/50 uppercase">Landing</p>
                  <p className="text-price mt-1 text-xl text-white/80">₹2,499</p>
                </div>
              </div>
            </div>

            <ul className="grid gap-5">
              {highlights.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3.5">
                  <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/15 shadow-[inset_0_1px_0_oklch(1_0_0/0.35)] backdrop-blur-md">
                    <Icon className="size-[18px] text-white/90" />
                  </span>
                  <span>
                    <span className="block font-medium">{title}</span>
                    <span className="block text-sm text-white/60">{body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="relative flex items-center gap-2 text-sm text-white/75">
            <ShieldCheck className="size-4" /> Internal tool. Access is limited to staff accounts.
          </p>
        </div>
      </aside>

      {/* Form */}
      <main className="flex flex-col">
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
          <div className="clay-card w-full max-w-sm rounded-[1.75rem] p-6 sm:p-8">
            <BrandLockup className="mb-10 lg:hidden" />
            <div className="mb-8 space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
              <p className="text-sm text-muted-foreground">
                Use the account your admin created for you.
              </p>
            </div>
            <Suspense fallback={<LoginFormSkeleton />}>
              <LoginForm />
            </Suspense>
            <p className="mt-8 text-center text-xs text-muted-foreground">
              Forgot your password? Ask a store admin to reset it.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function LoginFormSkeleton() {
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-11 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-11 w-full" />
      </div>
      <Skeleton className="h-11 w-full" />
    </div>
  );
}
