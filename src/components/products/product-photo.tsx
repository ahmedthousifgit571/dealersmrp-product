import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Product photo, or a neutral "no photo yet" tile. Plain <img>: the bytes come from our own auth-checked route. */
export function ProductPhoto({
  id,
  imageAt,
  name,
  className,
  iconClassName,
}: {
  id: string;
  imageAt: string | null;
  name: string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div className={cn("clay-well relative grid shrink-0 place-items-center overflow-hidden rounded-2xl", className)}>
      {imageAt ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/products/${id}/image?v=${new Date(imageAt).getTime()}`}
          alt={name}
          loading="lazy"
          decoding="async"
          className="size-full object-contain"
        />
      ) : (
        <ImageIcon className={cn("size-1/3 text-muted-foreground/50", iconClassName)} aria-label="No photo yet" />
      )}
    </div>
  );
}
