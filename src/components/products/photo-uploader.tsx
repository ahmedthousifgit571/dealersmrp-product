"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { compressImage } from "@/lib/image-compress";
import { ProductPhoto } from "./product-photo";

/** Admin: tap the photo box to take or choose a picture. Shrunk in the browser before upload. */
export function PhotoUploader({ id, imageAt, name }: { id: string; imageAt: string | null; name: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    try {
      const small = await compressImage(file, { maxEdge: 900, targetBytes: 300 * 1024 });
      const body = new FormData();
      body.set("file", small);
      const res = await fetch(`/api/products/${id}/image`, { method: "POST", body });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Could not save the photo.");
      toast.success("Photo saved.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the photo.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/products/${id}/image`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) {
      toast.success("Photo removed.");
      router.refresh();
    } else toast.error("Could not remove the photo.");
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={imageAt ? "Change product photo" : "Add product photo"}
        className="group relative block rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ProductPhoto id={id} imageAt={imageAt} name={name} className="size-36 md:size-44" />
        {!imageAt ? (
          <span className="absolute inset-x-0 bottom-3 text-center text-xs font-medium text-muted-foreground">Tap to add photo</span>
        ) : null}
        {busy ? (
          <span className="absolute inset-0 grid place-items-center rounded-2xl bg-background/60">
            <Spinner />
          </span>
        ) : null}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {imageAt ? <Camera data-icon="inline-start" /> : <ImagePlus data-icon="inline-start" />}
          {imageAt ? "Change photo" : "Add photo"}
        </Button>
        {imageAt ? (
          <Button type="button" variant="ghost" size="icon-sm" disabled={busy} onClick={remove} aria-label="Remove photo">
            <Trash2 />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
