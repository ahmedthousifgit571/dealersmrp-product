"use client";

import { usePathname } from "next/navigation";
import { BrandMark } from "@/components/brand";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import type { CurrentUser } from "@/lib/auth/dal";
import { currentNavItem } from "./nav";
import { CompactUserMenu } from "./user-menu";

export function TopBar({ user }: { user: CurrentUser }) {
  const pathname = usePathname();
  const item = currentNavItem(pathname);

  return (
    <header className="glass sticky top-2 z-30 mx-2 mt-2 flex h-14 shrink-0 items-center gap-2 rounded-[1.25rem] border border-(--clay-edge) px-2.5 shadow-clay-sm [--glass-alpha:78%] md:top-3 md:mx-3 md:mt-3 md:mr-4 md:h-16 md:rounded-3xl md:px-3 print:hidden">
      <SidebarTrigger className="-ml-1 hidden rounded-xl clay-raised md:inline-flex" />
      <Separator orientation="vertical" className="mx-1 hidden h-5 bg-transparent md:block" />
      <BrandMark className="size-8 md:hidden" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold tracking-tight">{item?.label ?? "ElectroPrice"}</p>
        {item ? (
          <p className="hidden truncate text-xs text-muted-foreground sm:block">{item.description}</p>
        ) : null}
      </div>
      <span className="clay-raised hidden rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground sm:inline-block">
        {user.role === "ADMIN" ? "Admin" : "Staff"}
      </span>
      <div className="md:hidden">
        <CompactUserMenu user={user} />
      </div>
    </header>
  );
}
