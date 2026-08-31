import * as React from "react";
import { Image as ImageIcon, Loader2 } from "lucide-react";

import { scanTooltip, type TooltipScan } from "@/lib/ocr";
import { cn } from "@/lib/utils";

interface ImagePasteZoneProps {
  readonly onScan: (scan: TooltipScan) => void;
}

type Status = "idle" | "processing" | "done" | "error";

export function ImagePasteZone({ onScan }: ImagePasteZoneProps) {
  const [status, setStatus] = React.useState<Status>("idle");
  const [errorMsg, setErrorMsg] = React.useState("");
  const [dragOver, setDragOver] = React.useState(false);
  const [zoomed, setZoomed] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const processImage = React.useCallback(
    async (source: File | Blob) => {
      setStatus("processing");
      setErrorMsg("");

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const newUrl = URL.createObjectURL(source);
      setPreviewUrl(newUrl);

      try {
        const scan = await scanTooltip(source);
        setStatus("done");
        onScan(scan);
        // Intentionally stays in "done" so the user can verify the image.
      } catch (err) {
        console.error("OCR failed:", err);
        setErrorMsg("Failed to read image. Try pasting again.");
        setStatus("error");
        setTimeout(() => setStatus("idle"), 3000);
      }
    },
    [onScan, previewUrl],
  );

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
      <div className="relative aspect-video w-full max-w-2xl overflow-hidden rounded-md border border-border bg-black/50 shadow-2xl">
        <img src={src} alt={alt} className="h-full w-full object-contain" />
      </div>
      <div className="pointer-events-none absolute right-4 top-4 rounded bg-black/50 px-3 py-1.5 text-sm text-white/50">
        Click anywhere to close
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
      onClick={() => status !== "processing" && fileInputRef.current?.click()}
      className={cn(
        "relative cursor-pointer rounded-md border border-dashed p-4 text-center transition-all",
        dragOver
          ? "border-primary bg-primary/10"
          : status === "error"
            ? "border-destructive/50 bg-destructive/5"
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

      {status === "processing" ? (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Scanning tooltip…</span>
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
              ✓ Scanned — values captured below
            </span>
            <span className="mt-1 max-w-[260px] text-[11px] text-muted-foreground">
              OCR may contain errors.
              <br />
              Double-check the values before trusting the result.
            </span>
          </div>
          {zoomed && previewUrl && zoomOverlay(previewUrl, "Pasted tooltip screenshot")}
        </div>
      ) : status === "error" ? (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-destructive">
          <span>{errorMsg}</span>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 py-8">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
            <span>
              Paste tooltip screenshot, drag image, or{" "}
              <span className="underline">browse</span>
            </span>
          </div>
          <p className="text-xs text-muted-foreground/70">
            Dungeon Quest Reborn item tooltip — see docs/Info/OCR-Input.md
          </p>
        </div>
      )}
    </div>
  );
}
