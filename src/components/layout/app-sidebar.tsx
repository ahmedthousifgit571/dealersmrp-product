"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLockup, BrandMark } from "@/components/brand";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import type { CurrentUser } from "@/lib/auth/dal";
import { isActive, navFor } from "./nav";
import { SidebarUserMenu } from "./user-menu";

export function AppSidebar({ user, businessName }: { user: CurrentUser; businessName: string }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const groups = navFor(user.role);

  return (
    <Sidebar collapsible="icon" variant="floating" className="print:hidden">
      <SidebarHeader className="h-[4.5rem] justify-center px-4 group-data-[collapsible=icon]:px-2">
        <Link href="/" className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
          <span className="group-data-[collapsible=icon]:hidden">
            <BrandLockup businessName={businessName} />
          </span>
          <BrandMark className="hidden size-8 group-data-[collapsible=icon]:inline-flex" />
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-1 pt-1">
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      isActive={isActive(pathname, item.href)}
                      tooltip={item.label}
                      className="h-10 px-3 group-data-[collapsible=icon]:px-2"
                      render={<Link href={item.href} onClick={() => setOpenMobile(false)} />}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="p-3 pb-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarUserMenu user={user} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
