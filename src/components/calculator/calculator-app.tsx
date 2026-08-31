import * as React from "react";

import { ImagePasteZone } from "@/components/calculator/image-paste-zone";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type TooltipScan } from "@/lib/ocr";

/*
  Calculator island. Phase 3 replaces the raw-text dump with tooltip field
  extraction (name, phys/spell/health, upgrades, req level), the difficulty
  resolution flow, and the pot calculation. See docs/PLAN.md.
*/

export function CalculatorApp() {
  const [scan, setScan] = React.useState<TooltipScan | null>(null);

  const text = scan ? [scan.rawText, scan.processedText].filter(Boolean).join("\n---\n") : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Item Potential Calculator</CardTitle>
        <CardDescription>
          Paste a Dungeon Quest Reborn item tooltip to score its potential.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ImagePasteZone onScan={setScan} />
        {scan && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground">
              Raw OCR output
            </p>
            <pre className="max-h-64 overflow-auto rounded-md bg-surface-lowest p-4 text-xs leading-relaxed text-muted-foreground">
              {text}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
