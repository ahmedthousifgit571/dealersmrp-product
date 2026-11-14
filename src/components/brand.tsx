import { cn } from "@/lib/utils";

/** ElectroPrice mark: a price tag cut with barcode bars. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "orb tone-orange inline-flex size-9 shrink-0 items-center justify-center rounded-[0.9rem]",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-[62%]" fill="none">
        <path
          d="M3.5 5.5A2 2 0 0 1 5.5 3.5h6.17a2 2 0 0 1 1.42.59l7.32 7.32a2 2 0 0 1 0 2.83l-6.17 6.17a2 2 0 0 1-2.83 0L4.09 13.09a2 2 0 0 1-.59-1.42V5.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <circle cx="8" cy="8" r="1.5" fill="currentColor" />
        <path d="M10.5 13.5v3M12.75 11.25v4.5M15 12.5v1.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function BrandLockup({ businessName, className }: { businessName?: string; className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="flex min-w-0 flex-col leading-none">
        <span className="text-base font-bold tracking-tight">ElectroPrice</span>
        {businessName && businessName !== "ElectroPrice" ? (
          <span className="mt-1 truncate text-xs text-muted-foreground">{businessName}</span>
        ) : (
          <span className="mt-1 text-xs text-muted-foreground">Dealer price &amp; MRP</span>
        )}
      </span>
    </span>
  );
}
