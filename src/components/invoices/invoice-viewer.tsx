"use client";

import { useState } from "react";
import { TransformComponent, TransformWrapper, useControls } from "react-zoom-pan-pinch";
import { ExternalLink, FileX2, Maximize, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ViewerFile = { id: string; mimeType: string; fileName: string; purged: boolean };

function Controls({ onRotate, href }: { onRotate: () => void; href: string }) {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  return (
    <div className="glass absolute top-3 right-3 z-10 flex gap-1 rounded-xl border border-(--clay-edge) p-1 shadow-clay">
      <Button variant="ghost" size="icon-sm" onClick={() => zoomIn()} aria-label="Zoom in">
        <ZoomIn />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => zoomOut()} aria-label="Zoom out">
        <ZoomOut />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={() => resetTransform()} aria-label="Fit to view">
        <Maximize />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={onRotate} aria-label="Rotate">
        <RotateCw />
      </Button>
      <a href={href} target="_blank" rel="noreferrer" className="inline-flex size-7 items-center justify-center rounded-md hover:bg-muted" aria-label="Open in a new tab">
        <ExternalLink className="size-4" />
      </a>
    </div>
  );
}

/** Left pane of the review: the uploaded pages, zoomable, so numbers can be checked against the table. */
export function InvoiceViewer({ scanId, files, className }: { scanId: string; files: ViewerFile[]; className?: string }) {
  const [index, setIndex] = useState(0);
  const [rotation, setRotation] = useState<Record<string, number>>({});
  const file = files[index];

  if (!file) {
    return (
      <div className={cn("flex items-center justify-center rounded-xl border bg-muted/40 text-sm text-muted-foreground", className)}>
        No pages uploaded.
      </div>
    );
  }
  const src = `/api/invoices/${scanId}/files/${file.id}`;
  const turn = rotation[file.id] ?? 0;

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border bg-zinc-100 dark:bg-zinc-900", className)}>
      <div className="relative min-h-0 flex-1">
        {file.purged ? (
          <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <FileX2 className="size-8" />
            The original file was removed after the retention period. The extracted lines are kept.
          </div>
        ) : file.mimeType === "application/pdf" ? (
          <>
            <iframe title={`Invoice ${file.fileName}`} src={`${src}#view=FitH&toolbar=1`} className="hidden size-full bg-white md:block" />
            <div className="flex size-full flex-col items-center justify-center gap-3 p-6 text-center text-sm md:hidden">
              <p className="text-muted-foreground">PDFs open in your phone&apos;s viewer.</p>
              <a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground">
                <ExternalLink className="size-4" /> Open the PDF
              </a>
            </div>
          </>
        ) : (
          <TransformWrapper key={file.id} minScale={0.5} maxScale={8} initialScale={1} limitToBounds={false} wheel={{ step: 0.15 }}>
            <Controls href={src} onRotate={() => setRotation((r) => ({ ...r, [file.id]: ((r[file.id] ?? 0) + 90) % 360 }))} />
            <TransformComponent wrapperClass="!size-full" contentClass="!size-full flex items-start justify-center p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={`Invoice page ${index + 1}`}
                className="max-h-full max-w-full object-contain shadow-sm transition-transform duration-200"
                style={{ transform: `rotate(${turn}deg)` }}
                draggable={false}
              />
            </TransformComponent>
          </TransformWrapper>
        )}
      </div>
      {files.length > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto border-t bg-background/80 p-2">
          {files.map((f, i) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setIndex(i)}
              className={cn(
                "shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium",
                i === index ? "border-primary bg-accent text-accent-foreground" : "bg-card hover:bg-muted",
              )}
            >
              Page {i + 1}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
