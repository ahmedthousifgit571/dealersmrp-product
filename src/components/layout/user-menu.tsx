"use client";

import { useTransition } from "react";
import { useTheme } from "next-themes";
import { ChevronsUpDown, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { logout } from "@/app/actions/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { initials } from "@/lib/format";
import type { CurrentUser } from "@/lib/auth/dal";
import { cn } from "@/lib/utils";

function UserAvatar({ user, className }: { user: CurrentUser; className?: string }) {
  return (
    <Avatar className={cn("size-8 rounded-xl after:hidden", className)}>
      <AvatarFallback className="orb tone-teal rounded-xl text-xs font-semibold">
        {initials(user.name)}
      </AvatarFallback>
    </Avatar>
  );
}

function MenuBody({ user }: { user: CurrentUser }) {
  const { theme, setTheme } = useTheme();
  const [pending, startTransition] = useTransition();
  return (
    <>
      <DropdownMenuGroup>
        <DropdownMenuLabel className="flex items-center gap-2.5 py-2">
          <UserAvatar user={user} />
          <span className="grid min-w-0 leading-tight">
            <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
        </DropdownMenuLabel>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>Appearance</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme ?? "light"} onValueChange={(v) => setTheme(String(v))}>
          <DropdownMenuRadioItem value="light">
            <Sun /> Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon /> Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor /> Match device
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabled={pending}
        onClick={() => startTransition(() => logout())}
      >
        <LogOut /> {pending ? "Signing out…" : "Sign out"}
      </DropdownMenuItem>
    </>
  );
}

/** Sidebar footer version. */
export function SidebarUserMenu({ user }: { user: CurrentUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <SidebarMenuButton size="lg" className="glass rounded-2xl border border-(--clay-edge) shadow-clay-sm hover:bg-card/80 data-popup-open:bg-card/80 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:shadow-none group-data-[collapsible=icon]:backdrop-blur-none">
            <UserAvatar user={user} />
            <span className="grid flex-1 text-left leading-tight">
              <span className="truncate text-sm font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {user.role === "ADMIN" ? "Admin" : "Staff"}
              </span>
            </span>
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" />
          </SidebarMenuButton>
        }
      />
      <DropdownMenuContent side="top" align="start" className="w-64">
        <MenuBody user={user} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Phone top-bar version. */
export function CompactUserMenu({ user }: { user: CurrentUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <UserAvatar user={user} className="size-9" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <MenuBody user={user} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
