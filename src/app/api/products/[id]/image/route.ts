import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeApi } from "@/lib/auth/dal";
import { db } from "@/lib/db";

const MAX_BYTES = 1024 * 1024; // the browser shrinks photos to well under this
const TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Product photo. Any signed-in user may look at it; the version in the URL (?v=) busts the cache. */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/products/[id]/image">) {
  const auth = await authorizeApi();
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const image = await db.productImage.findUnique({ where: { productId: id }, select: { data: true, mimeType: true } });
  if (!image) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(image.data), {
    headers: { "Content-Type": image.mimeType, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}

/** Admins: add or replace the photo. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/products/[id]/image">) {
  const auth = await authorizeApi("ADMIN");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No photo received." }, { status: 400 });
  if (!TYPES.includes(file.type)) return Response.json({ error: "Use a JPG, PNG or WebP photo." }, { status: 415 });
  if (file.size > MAX_BYTES) return Response.json({ error: "Photo is too large (over 1 MB)." }, { status: 413 });
  if (!(await db.product.findUnique({ where: { id }, select: { id: true } }))) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const now = new Date();
  await db.$transaction([
    db.productImage.upsert({
      where: { productId: id },
      create: { productId: id, mimeType: file.type, data, size: file.size },
      update: { mimeType: file.type, data, size: file.size },
    }),
    db.product.update({ where: { id }, data: { imageAt: now }, select: { id: true } }),
  ]);
  revalidatePath("/");
  revalidatePath(`/products/${id}`);
  return Response.json({ imageAt: now.toISOString() }, { status: 201 });
}

/** Admins: remove the photo. */
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/products/[id]/image">) {
  const auth = await authorizeApi("ADMIN");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  await db.$transaction([
    db.productImage.deleteMany({ where: { productId: id } }),
    db.product.updateMany({ where: { id }, data: { imageAt: null } }),
  ]);
  revalidatePath("/");
  revalidatePath(`/products/${id}`);
  return Response.json({ ok: true });
}
