import type { Metadata } from "next";
import { Suspense } from "react";
import { ShieldCheck, UserRoundCheck, UserRoundX } from "lucide-react";
import { PageHeader, StatTile } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { AddUserButton, UsersTable, type UserRow } from "./users-table";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 md:px-8 md:py-8">
      <Suspense fallback={<UsersSkeleton />}>
        <UsersData />
      </Suspense>
    </main>
  );
}

async function UsersData() {
  const me = await requireAdmin();
  const users = await db.user.findMany({
    orderBy: [{ isActive: "desc" }, { role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      lockedUntil: true,
      lastLoginAt: true,
      createdAt: true,
      _count: { select: { priceChanges: true } },
    },
  });
  const now = new Date();
  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    locked: !!u.lockedUntil && u.lockedUntil > now,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    priceChanges: u._count.priceChanges,
  }));
  const admins = rows.filter((r) => r.isActive && r.role === "ADMIN").length;
  const staff = rows.filter((r) => r.isActive && r.role === "STAFF").length;
  const inactive = rows.filter((r) => !r.isActive).length;

  return (
    <>
      <PageHeader
        title="Users"
        description="Staff can search and scan. Admins can also change prices, import, review invoices and manage this list."
        actions={<AddUserButton />}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon={ShieldCheck} label="Admins" value={admins} hint="Full access" />
        <StatTile icon={UserRoundCheck} tone="success" label="Staff" value={staff} hint="Search, scan, upload invoices" />
        <StatTile icon={UserRoundX} tone="warning" label="Deactivated" value={inactive} hint="Can't sign in" />
      </div>
      <UsersTable rows={rows} currentUserId={me.id} />
    </>
  );
}

function UsersSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-[74px] rounded-xl" />
        <Skeleton className="h-[74px] rounded-xl" />
        <Skeleton className="h-[74px] rounded-xl" />
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}
