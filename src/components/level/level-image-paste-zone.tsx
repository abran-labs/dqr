import * as React from "react";
import { Image as ImageIcon, Loader2 } from "lucide-react";

import { scanXpScreenshot } from "@/lib/xp-ocr";
import { cn } from "@/lib/utils";

type Status = "idle" | "processing" | "done" | "error";

export function LevelImagePasteZone({ initialPreviewUrl, onPreviewChange, onScan, revision }: {
  readonly initialPreviewUrl: string | null;
  readonly onPreviewChange: (dataUrl: string | null) => void;
  readonly onScan: (text: string, revision: number) => string | null;
  readonly revision: number;
}) {
  const [status, setStatus] = React.useState<Status>(initialPreviewUrl === null ? "idle" : "done");
  const [message, setMessage] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<string | null>(initialPreviewUrl);
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const scanId = React.useRef(0);
  const revisionRef = React.useRef(revision);
  revisionRef.current = revision;

  React.useEffect(() => {
    if (initialPreviewUrl === null) return;
    setPreview(initialPreviewUrl);
    setStatus("done");
  }, [initialPreviewUrl]);

  const process = React.useCallback(async (source: File | Blob) => {
    scanId.current += 1;
    const currentScan = scanId.current;
    const currentRevision = revision;
    setStatus("processing");
    setMessage(null);
    try {
      const text = await scanXpScreenshot(source);
      if (currentScan !== scanId.current || currentRevision !== revisionRef.current) return;
      const nextPreview = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(source);
      });
      if (currentScan !== scanId.current || currentRevision !== revisionRef.current) return;
      const error = onScan(text, currentRevision);
      if (error !== null) {
        setMessage(error);
        setStatus("error");
        return;
      }
      onPreviewChange(nextPreview);
      setPreview(nextPreview);
      setStatus("done");
    } catch (error) {
      if (currentScan !== scanId.current || currentRevision !== revisionRef.current) return;
      setMessage(error instanceof Error ? error.message : "Couldn't read that screenshot.");
      setStatus("error");
    }
  }, [onPreviewChange, onScan, revision]);

  React.useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((entry) => entry.type.startsWith("image/"));
      const blob = item?.getAsFile();
      if (blob == null) return;
      event.preventDefault();
      void process(blob);
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [process]);
  React.useEffect(() => () => {
    scanId.current += 1;
  }, []);

  return (
    <div
      className={cn("cursor-pointer rounded-lg border border-dashed p-4 text-center", dragOver ? "border-primary bg-primary/10" : status === "error" ? "border-destructive" : "border-border")}
      onClick={() => inputRef.current?.click()}
      onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        const file = event.dataTransfer.files[0];
        if (file !== undefined) void process(file);
      }}
    >
      <input
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) void process(file);
          event.target.value = "";
        }}
        onClick={(event) => event.stopPropagation()}
        ref={inputRef}
        type="file"
      />
      {status === "processing" ? (
        <div className="flex min-h-20 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Reading EXP bar…</div>
      ) : status === "done" ? (
        <div className="flex items-center justify-center gap-4">
          {preview !== null && (
            <img className="h-20 max-w-40 rounded border border-border object-contain" src={preview} alt="EXP bar screenshot" />
          )}
          <span className="text-sm text-success">EXP autofill complete</span>
        </div>
      ) : status === "error" ? (
        <div className="min-h-20 content-center text-sm text-destructive" role="alert">{message ?? "Couldn't read that screenshot."}</div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 pb-4 pt-6">
          <img
            alt="Example EXP bar screenshot"
            className="h-24 w-auto rounded border border-border/50 object-contain opacity-70"
            height={236}
            src="/example-xp.webp"
            width={714}
          />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
            <span>
              paste screenshot, drag image, or{" "}
              <button
                className="underline hover:text-foreground"
                onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}
                type="button"
              >browse</button>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
