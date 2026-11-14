import { Suspense } from "react";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { TopBar } from "@/components/layout/top-bar";
import { ScannerProvider, ScannerRole } from "@/components/scanner/scanner-provider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/dal";
import { getSettings } from "@/lib/settings";

// The chrome reads the session inside its own Suspense boundaries, so page content
// streams in parallel instead of waiting behind the layout.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <ScannerProvider>
      <SidebarProvider>
        <Suspense fallback={<SidebarSkeleton />}>
          <SidebarSlot />
        </Suspense>
        <SidebarInset className="min-w-0 bg-transparent">
          <Suspense fallback={<TopBarSkeleton />}>
            <TopBarSlot />
          </Suspense>
          <div className="flex flex-1 flex-col pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0 print:pb-0">
            {children}
          </div>
          <Suspense fallback={null}>
            <MobileNavSlot />
          </Suspense>
        </SidebarInset>
      </SidebarProvider>
    </ScannerProvider>
  );
}

async function SidebarSlot() {
  const user = await requireUser();
  const settings = await getSettings();
  return <AppSidebar user={user} businessName={settings.businessName} />;
}

async function TopBarSlot() {
  const user = await requireUser();
  return <TopBar user={user} />;
}

async function MobileNavSlot() {
  const user = await requireUser();
  return (
    <>
      <ScannerRole role={user.role} />
      <MobileNav role={user.role} />
    </>
  );
}

function SidebarSkeleton() {
  return (
    <div className="sidebar-clay m-3 hidden h-[calc(100svh-1.5rem)] w-[calc(var(--sidebar-width)-1.5rem)] shrink-0 flex-col gap-4 rounded-[1.75rem] p-3 md:flex">
      <div className="flex h-8 items-center gap-2.5">
        <Skeleton className="size-9 rounded-xl" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    </div>
  );
}

function TopBarSkeleton() {
  return (
    <div className="mx-2 mt-2 flex h-14 items-center gap-3 rounded-[1.25rem] px-4 md:mx-3 md:mt-3 md:mr-4 md:h-16">
      <Skeleton className="size-7" />
      <Skeleton className="h-4 w-32" />
    </div>
  );
}
