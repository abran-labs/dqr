import * as React from "react";
import { Image as ImageIcon, Loader2 } from "lucide-react";

import { scanTooltip, type TooltipScan } from "@/lib/ocr";
import { cn } from "@/lib/utils";

interface ImagePasteZoneProps {
  /** Returns true when the scan produced an item or any number. */
  readonly onScan: (scan: TooltipScan) => boolean;
}

type Status = "idle" | "processing" | "done" | "error";

export function ImagePasteZone({ onScan }: ImagePasteZoneProps) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [dragOver, setDragOver] = React.useState(false);
  const [zoomed, setZoomed] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const previewUrlRef = React.useRef<string | null>(null);
  const idleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearIdleTimer = React.useCallback(() => {
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const dropPreview = React.useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
    setZoomed(false);
  }, []);

  const fail = React.useCallback(() => {
    dropPreview();
    setStatus("error");
    clearIdleTimer();
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
      setStatus("idle");
    }, 3000);
  }, [clearIdleTimer, dropPreview]);

  const processImage = React.useCallback(
    async (source: File | Blob) => {
      clearIdleTimer();
      setStatus("processing");

      try {
        const scan = await scanTooltip(source);
        if (!onScan(scan)) {
          fail();
          return;
        }
        dropPreview();
        const newUrl = URL.createObjectURL(source);
        previewUrlRef.current = newUrl;
        setPreviewUrl(newUrl);
        setStatus("done");
      } catch (err) {
        console.error("OCR failed:", err);
        fail();
      }
    },
    [clearIdleTimer, dropPreview, fail, onScan],
  );

  React.useEffect(() => () => clearIdleTimer(), [clearIdleTimer]);

  // Global paste listener
  React.useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) processImage(blob);
          return;
        }
      }
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [processImage]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) {
      processImage(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
    // Reset so the same file can be selected again.
    e.target.value = "";
  };

  const preview = (src: string, alt: string) => (
    <div className="relative w-48 overflow-hidden rounded border border-border/50 shadow-sm">
      <img src={src} alt={alt} className="h-32 w-full object-contain" />
    </div>
  );

  const zoomOverlay = (src: string, alt: string) => (
    <div
      className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={(e) => {
        e.stopPropagation();
        setZoomed(false);
      }}
    >
      <div className="flex max-h-full max-w-2xl flex-col items-center gap-3">
        <img
          src={src}
          alt={alt}
          className="block max-h-[min(80vh,24rem)] w-auto max-w-full rounded-md border border-border object-contain shadow-2xl"
        />
        <div className="pointer-events-none rounded bg-black/50 px-3 py-1.5 text-sm text-white/50">
          Click anywhere to close
        </div>
      </div>
    </div>
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => status !== "processing" && status !== "error" && fileInputRef.current?.click()}
      className={cn(
        "relative cursor-pointer rounded-md border border-dashed p-4 text-center",
        dragOver
          ? "border-primary bg-primary/10"
          : status === "error"
            ? "border-destructive bg-destructive/5"
            : status === "done"
              ? "border-success/50 bg-success/5"
              : "border-border/60 hover:border-border hover:bg-surface-high/40",
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {status === "error" ? (
        <div className="flex min-h-[5.5rem] items-center justify-center py-6 text-sm text-destructive">
          Invalid screenshot: No item data found.
        </div>
      ) : status === "processing" ? (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Scanning image…</span>
        </div>
      ) : status === "done" ? (
        <div className="flex flex-col items-center justify-center gap-2 py-2">
          <button
            type="button"
            className="flex cursor-zoom-in flex-col items-center opacity-90 transition-opacity hover:opacity-100"
            title="Click to view full size"
            onClick={(e) => {
              e.stopPropagation();
              setZoomed(true);
            }}
          >
            {previewUrl && preview(previewUrl, "Pasted tooltip screenshot")}
          </button>
          <div className="pointer-events-none mt-2 flex flex-col items-center text-center">
            <span className="text-sm font-medium text-success">
              ✓ Auto-filled from image
            </span>
            <span className="mt-1 max-w-[260px] text-[11px] text-muted-foreground">
              Auto-fill may contain errors.
            </span>
          </div>
          {zoomed && previewUrl && zoomOverlay(previewUrl, "Pasted tooltip screenshot")}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 py-6">
          <img
            src="/example-tooltip.webp"
            alt="Example item tooltip screenshot"
            width={269}
            height={258}
            className="h-24 w-auto object-contain opacity-40 brightness-125"
          />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
            <span>
              paste screenshot, drag image, or{" "}
              <span className="underline">browse</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
