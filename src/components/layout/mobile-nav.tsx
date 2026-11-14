"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, ScanBarcode } from "lucide-react";
import { useScanner } from "@/components/scanner/scanner-provider";
import { useSidebar } from "@/components/ui/sidebar";
import type { Role } from "@/lib/auth/jwt";
import { cn } from "@/lib/utils";
import { isActive, navFor } from "./nav";

const itemClass =
  "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-medium text-muted-foreground transition-colors active:bg-foreground/5";

/** Phone bottom bar: main screens one thumb-tap away, with the barcode scanner in the middle. */
export function MobileNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const { openScanner } = useScanner();
  const items = navFor(role)
    .flatMap((g) => g.items)
    .filter((i) => i.mobile)
    .slice(0, 3);
  const scanAt = Math.ceil(items.length / 2) === items.length ? 1 : Math.ceil(items.length / 2);

  const links = items.map((item) => {
    const active = isActive(pathname, item.href);
    return (
      <li key={item.href} className="flex flex-1">
        <Link href={item.href} aria-current={active ? "page" : undefined} className={cn(itemClass, active && "font-semibold text-primary")}>
          <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-[background-color,box-shadow]", active && "bg-primary/12 shadow-[inset_0_1px_0_oklch(1_0_0/0.6)]")}>
            <item.icon className="size-5" />
          </span>
          {item.short ?? item.label}
        </Link>
      </li>
    );
  });

  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden print:hidden">
      <ul className="glass mx-auto flex h-16 max-w-md items-stretch justify-around rounded-[1.75rem] border border-(--clay-edge) px-2 shadow-clay-lg [--glass-alpha:88%]">
        {links.slice(0, scanAt)}
        <li className="flex flex-1 items-start justify-center">
          <button
            type="button"
            onClick={openScanner}
            aria-label="Scan a barcode"
            className="clay-primary -mt-6 flex size-14 items-center justify-center rounded-[1.25rem] ring-4 ring-background/80 transition-transform active:scale-95 active:shadow-press"
          >
            <ScanBarcode className="size-6" />
          </button>
        </li>
        {links.slice(scanAt)}
        <li className="flex flex-1">
          <button type="button" onClick={() => setOpenMobile(true)} className={itemClass}>
            <span className="flex h-7 w-12 items-center justify-center rounded-full">
              <Menu className="size-5" />
            </span>
            Menu
          </button>
        </li>
      </ul>
    </nav>
  );
}
