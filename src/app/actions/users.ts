"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { hashPassword } from "@/lib/auth/password";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const PasswordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(72, "Use at most 72 characters");

const CreateUserSchema = z.object({
  name: z.string().trim().min(2, "Enter the person's name").max(80),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")),
  role: z.enum(["ADMIN", "STAFF"]),
  password: PasswordSchema,
});

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

async function activeAdminCount(excludeId?: string) {
  return db.user.count({
    where: { role: "ADMIN", isActive: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
}

export async function createUser(input: z.input<typeof CreateUserSchema>): Promise<ActionResult> {
  await requireAdmin();
  const parsed = CreateUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const exists = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (exists) return { ok: false, error: "Someone already uses that email address." };

  await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      role: parsed.data.role,
      passwordHash: await hashPassword(parsed.data.password),
    },
  });
  revalidatePath("/admin/users");
  return { ok: true, message: `${parsed.data.name} can now sign in.` };
}

const UpdateUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2, "Enter the person's name").max(80),
  role: z.enum(["ADMIN", "STAFF"]),
});

export async function updateUser(input: z.input<typeof UpdateUserSchema>): Promise<ActionResult> {
  const me = await requireAdmin();
  const parsed = UpdateUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const { id, name, role } = parsed.data;

  const target = await db.user.findUnique({ where: { id } });
  if (!target) return { ok: false, error: "That user no longer exists." };
  if (target.role === "ADMIN" && role === "STAFF") {
    if (id === me.id) return { ok: false, error: "You can't remove your own admin access." };
    if ((await activeAdminCount(id)) === 0) return { ok: false, error: "Keep at least one active admin." };
  }

  await db.user.update({
    where: { id },
    // A role change re-issues sessions so the new permissions apply at once.
    data: { name, role, ...(role !== target.role ? { sessionVersion: { increment: 1 } } : {}) },
  });
  revalidatePath("/admin/users");
  return { ok: true, message: "Changes saved." };
}

export async function setUserActive(id: string, active: boolean): Promise<ActionResult> {
  const me = await requireAdmin();
  if (id === me.id && !active) return { ok: false, error: "You can't deactivate your own account." };
  const target = await db.user.findUnique({ where: { id } });
  if (!target) return { ok: false, error: "That user no longer exists." };
  if (!active && target.role === "ADMIN" && (await activeAdminCount(id)) === 0) {
    return { ok: false, error: "Keep at least one active admin." };
  }
  await db.user.update({
    where: { id },
    data: { isActive: active, sessionVersion: { increment: 1 }, failedLogins: 0, lockedUntil: null },
  });
  revalidatePath("/admin/users");
  return { ok: true, message: active ? `${target.name} can sign in again.` : `${target.name} has been signed out and blocked.` };
}

export async function resetUserPassword(id: string, password: string): Promise<ActionResult> {
  await requireAdmin();
  const parsed = PasswordSchema.safeParse(password);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const target = await db.user.findUnique({ where: { id } });
  if (!target) return { ok: false, error: "That user no longer exists." };
  await db.user.update({
    where: { id },
    data: {
      passwordHash: await hashPassword(parsed.data),
      sessionVersion: { increment: 1 },
      failedLogins: 0,
      lockedUntil: null,
    },
  });
  revalidatePath("/admin/users");
  return { ok: true, message: `Password reset. ${target.name} must sign in again.` };
}
