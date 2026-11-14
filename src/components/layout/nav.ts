import {
  FileScan,
  History,
  LayoutDashboard,
  Package,
  Search,
  Settings2,
  Sheet,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/auth/jwt";

export type NavItem = {
  href: string;
  label: string;
  /** Shorter label for the phone bottom bar. */
  short?: string;
  icon: LucideIcon;
  roles: Role[];
  /** Shown in the phone bottom bar. */
  mobile?: boolean;
  description: string;
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Shop floor",
    items: [
      {
        href: "/",
        label: "Price Finder",
        short: "Finder",
        icon: Search,
        roles: ["ADMIN", "STAFF"],
        mobile: true,
        description: "Search by name, brand, model number, SKU or barcode.",
      },
      {
        href: "/invoices",
        label: "Invoices",
        icon: FileScan,
        roles: ["ADMIN", "STAFF"],
        mobile: true,
        description: "Supplier bills read by AI, reviewed before prices change.",
      },
    ],
  },
  {
    label: "Catalogue",
    items: [
      {
        href: "/admin",
        label: "Dashboard",
        icon: LayoutDashboard,
        roles: ["ADMIN"],
        description: "Price movement, stock alerts and invoices waiting for review.",
      },
      {
        href: "/admin/products",
        label: "Products",
        icon: Package,
        roles: ["ADMIN"],
        mobile: true,
        description: "Add, edit, re-price and archive products.",
      },
      {
        href: "/admin/import",
        label: "Excel import",
        icon: Sheet,
        roles: ["ADMIN"],
        description: "Update many prices at once from a spreadsheet.",
      },
      {
        href: "/admin/history",
        label: "Price history",
        icon: History,
        roles: ["ADMIN"],
        description: "Every price change: when, by whom and from which source.",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/admin/users",
        label: "Users",
        icon: Users,
        roles: ["ADMIN"],
        description: "Who can sign in, and what they can change.",
      },
      {
        href: "/admin/settings",
        label: "Settings",
        icon: Settings2,
        roles: ["ADMIN"],
        description: "Shop details, price visibility and defaults.",
      },
    ],
  },
];

export function navFor(role: Role): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(role)) })).filter(
    (g) => g.items.length > 0,
  );
}

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Titles for pages that aren't nav destinations themselves.
const EXTRA_TITLES: { pattern: RegExp; label: string; description: string }[] = [
  { pattern: /^\/products\/[^/]+$/, label: "Product", description: "Current prices and full price history." },
  { pattern: /^\/admin\/products\/new$/, label: "Add product", description: "New products get the next SKU automatically." },
  { pattern: /^\/admin\/products\/[^/]+\/edit$/, label: "Edit product", description: "Price changes are recorded in the history." },
  { pattern: /^\/invoices\/new$/, label: "Scan invoice", description: "Photograph or upload a supplier bill." },
  { pattern: /^\/invoices\/[^/]+$/, label: "Invoice review", description: "Check what the AI read before prices change." },
];

export function currentNavItem(pathname: string): Pick<NavItem, "label" | "description"> | undefined {
  const extra = EXTRA_TITLES.find((t) => t.pattern.test(pathname));
  if (extra) return extra;
  const all = NAV.flatMap((g) => g.items);
  return all
    .filter((i) => isActive(pathname, i.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
