"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { DUMMY_HASH, verifyPassword } from "@/lib/auth/password";
import { createSession, deleteSession } from "@/lib/auth/session";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export type LoginState = {
  error?: string;
  fieldErrors?: { email?: string; password?: string };
  email?: string;
};

function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/login")) return "/";
  return next;
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) {
    const fields = z.flattenError(parsed.error).fieldErrors;
    return { email, fieldErrors: { email: fields.email?.[0], password: fields.password?.[0] } };
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  const now = new Date();

  if (user?.lockedUntil && user.lockedUntil > now) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000);
    return { email, error: `Too many failed attempts. Try again in ${minutes} min.` };
  }

  const ok = await verifyPassword(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !ok || !user.isActive) {
    if (user && !ok) {
      const failed = user.failedLogins + 1;
      await db.user.update({
        where: { id: user.id },
        data:
          failed >= MAX_ATTEMPTS
            ? { failedLogins: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60000) }
            : { failedLogins: failed },
      });
    }
    if (user && ok && !user.isActive) {
      return { email, error: "This account has been deactivated. Ask an admin to restore it." };
    }
    return { email, error: "Email or password is incorrect." };
  }

  await db.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: now },
  });
  await createSession({ sub: user.id, role: user.role, sv: user.sessionVersion });
  redirect(safeNext(parsed.data.next));
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
