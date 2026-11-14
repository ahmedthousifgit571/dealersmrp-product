import "server-only";
import type { CurrentUser } from "@/lib/auth/dal";
import { db } from "@/lib/db";

/** The scan, if this user may see it: admins see all, staff only their own uploads. */
export async function scanForUser(scanId: string, user: CurrentUser) {
  const scan = await db.invoiceScanLog.findUnique({
    where: { id: scanId },
    select: { id: true, status: true, uploadedById: true },
  });
  if (!scan) return null;
  if (user.role !== "ADMIN" && scan.uploadedById !== user.id) return null;
  return scan;
}

export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"];
export const MAX_FILE_BYTES = 4 * 1024 * 1024; // keeps each request under Vercel's 4.5 MB body limit
export const MAX_PAGES = 6;
