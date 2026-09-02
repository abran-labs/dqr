import * as React from "react";

import type { AutofillField } from "@/lib/autofill-feedback";
import { announceStatsUpdate, submitFeedback } from "@/lib/stats-client";

export function AutofillVote(props: {
  readonly calculationId: number | null;
  readonly field: AutofillField;
}) {
  const [sent, setSent] = React.useState<boolean | null>(null);
  const locked = React.useRef(false);
  const pending = React.useRef<boolean | null>(null);

  React.useEffect(() => {
    if (props.calculationId === null || pending.current === null) return;
    const accurate = pending.current;
    pending.current = null;
    void submitFeedback(props.calculationId, props.field, accurate).then((ok) => {
      if (ok) announceStatsUpdate();
    });
  }, [props.calculationId, props.field]);

  if (sent !== null) {
    return <span className="text-xs text-muted-foreground">Thanks</span>;
  }

  const send = (accurate: boolean) => {
    if (locked.current) return;
    locked.current = true;
    setSent(accurate);
    if (props.calculationId === null) {
      pending.current = accurate;
      return;
    }
    void submitFeedback(props.calculationId, props.field, accurate).then((ok) => {
      if (ok) announceStatsUpdate();
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Was autofill accurate?</span>
      <button
        className="text-xs font-medium text-green-400 underline hover:text-green-300"
        onClick={() => send(true)}
        type="button"
      >
        Yes
      </button>
      <button
        className="text-xs font-medium text-red-400 underline hover:text-red-300"
        onClick={() => send(false)}
        type="button"
      >
        No
      </button>
    </div>
  );
}
