// Data Access Layer: the one place that decides who the current user is.
// proxy.ts only does an optimistic redirect; every page, server action and route
// handler re-checks here, against the database.
import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { readSession } from "./session";
import type { Role } from "./jwt";

export type CurrentUser = { id: string; name: string; email: string; role: Role };

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await readSession();
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: { id: true, name: true, email: true, role: true, isActive: true, sessionVersion: true },
  });
  if (!user || !user.isActive || user.sessionVersion !== session.sv) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
});

/**
 * Pages and server actions: signed-in user, or off to sign in again.
 * proxy.ts already sent cookie-less visitors to /login, so reaching here without a user means
 * the cookie is valid but revoked; /auth/session-ended clears it (otherwise proxy and DAL
 * would bounce the browser between /login and / forever).
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/session-ended");
  return user;
}

/** Pages and server actions: admins only; staff are sent back to the Price Finder. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

/** Route handlers: returns the user, or a 401/403 JSON response to send back. */
export async function authorizeApi(
  role?: Role,
): Promise<{ user: CurrentUser; error?: never } | { user?: never; error: Response }> {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "Not signed in" }, { status: 401 }) };
  if (role === "ADMIN" && user.role !== "ADMIN") {
    return { error: Response.json({ error: "Admins only" }, { status: 403 }) };
  }
  return { user };
}
