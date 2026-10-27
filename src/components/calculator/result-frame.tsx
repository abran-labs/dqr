import { Check, Copy } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

export function ResultFrame({ title, accentColor, children, actions, copied, onCopy }: {
  readonly title: string;
  readonly accentColor: string;
  readonly children: ReactNode;
  readonly actions?: ReactNode;
  readonly copied?: boolean;
  readonly onCopy?: () => void;
}) {
  return (
    <div className="space-y-4 rounded-md border border-border bg-surface-low p-4">
      <div className="flex items-start justify-between gap-2 border-b border-foreground/20 pb-2">
        <div className="min-w-0 pt-2 text-xs font-semibold uppercase tracking-widest" style={{ color: accentColor }}>
          {title}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          {actions}
          {onCopy !== undefined && (
            <Button
              aria-label="Copy for Discord"
              className="h-8 w-8"
              onClick={onCopy}
              size="icon"
              title="Copy for Discord"
              type="button"
              variant="ghost"
            >
              {copied === true ? <Check aria-hidden /> : <Copy aria-hidden />}
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}
