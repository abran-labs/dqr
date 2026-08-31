import { Check, X } from "lucide-react";
import * as React from "react";

import { ImagePasteZone } from "@/components/calculator/image-paste-zone";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { type TooltipScan } from "@/lib/ocr";
import { announceStatsUpdate, logCalculation, submitFeedback } from "@/lib/stats-client";

/*
  Calculator island. Phase 3 replaces the raw-text dump with tooltip field
  extraction (name, phys/spell/health, upgrades, req level), the difficulty
  resolution flow, and the pot calculation. See docs/PLAN.md.

  Every completed scan logs a calculation against the stats API and asks the
  user whether the OCR read was accurate — the answer feeds the accuracy stat.
*/

export function CalculatorApp() {
  const [scan, setScan] = React.useState<TooltipScan | null>(null);
  const [calculationId, setCalculationId] = React.useState<number | null>(null);
  const [feedbackSent, setFeedbackSent] = React.useState<boolean | null>(null);

  const text = scan ? [scan.rawText, scan.processedText].filter(Boolean).join("\n---\n") : "";

  const handleScan = (next: TooltipScan) => {
    setScan(next);
    setCalculationId(null);
    setFeedbackSent(null);
    void logCalculation(next).then((id) => {
      if (id !== null) {
        setCalculationId(id);
        announceStatsUpdate();
      }
    });
  };

  const sendFeedback = (accurate: boolean) => {
    if (calculationId === null || feedbackSent !== null) return;
    setFeedbackSent(accurate);
    void submitFeedback(calculationId, accurate).then(() => announceStatsUpdate());
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Item Potential Calculator</CardTitle>
        <CardDescription>
          Paste a Dungeon Quest Reborn item tooltip to score its potential.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ImagePasteZone onScan={handleScan} />
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
        {calculationId !== null && (
          <div className="rounded-lg border border-border/60 bg-surface-low p-4">
            {feedbackSent === null ? (
              <>
                <p className="text-sm font-medium text-foreground">
                  Were the numbers read from your screenshot accurate?
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  This trains our public accuracy stat. The screenshot and OCR
                  text are logged so reads can be re-verified later — nothing
                  is tied to you.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => sendFeedback(true)}>
                    <Check className="h-4 w-4" aria-hidden /> Accurate
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => sendFeedback(false)}>
                    <X className="h-4 w-4" aria-hidden /> Off
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Thanks — recorded.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
