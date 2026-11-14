// Browser-only: shrinks phone photos before upload (keeps text sharp, cuts 4–12 MB photos to ~0.5–1.5 MB).

const MAX_EDGE = 2400;
const TARGET_BYTES = 3.6 * 1024 * 1024;

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Older Safari: fall back to an <img> element.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Returns a JPEG no larger than ~3.6 MB, or the original file if it can't be decoded here (e.g. HEIC on Chrome). */
export async function compressImage(file: File): Promise<File> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    return file;
  }
  const width = "naturalWidth" in source ? source.naturalWidth : source.width;
  const height = "naturalHeight" in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ("close" in source) source.close();

  for (const quality of [0.85, 0.75, 0.62]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && (blob.size <= TARGET_BYTES || quality === 0.62)) {
      const name = file.name.replace(/\.[^.]+$/, "") || "invoice";
      return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
    }
  }
  return file;
}
