import * as React from "react";

import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

const SECOND_STEP = 5;

/** Total seconds → decimal-minutes string stored in preferences ("" = unset). */
export function secondsToMinutesText(seconds: number | null): string {
  return seconds === null || seconds <= 0 ? "" : String(seconds / 60);
}

export function minutesTextToSeconds(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 60) : null;
}

export function RunTimePicker({ limitSeconds, onChange, seconds }: {
  readonly limitSeconds: number;
  readonly onChange: (seconds: number | null) => void;
  readonly seconds: number | null;
}) {
  const maxMinutes = Math.floor(limitSeconds / 60);
  const clamped = seconds === null ? 0 : Math.min(seconds, limitSeconds);
  const minutePart = Math.floor(clamped / 60);
  const secondPart = Math.round((clamped % 60) / SECOND_STEP) * SECOND_STEP;
  const secondCap = (minute: number) => (minute === maxMinutes ? limitSeconds - maxMinutes * 60 : 59);

  const minuteOptions = React.useMemo<ComboboxOption[]>(
    () => Array.from({ length: maxMinutes + 1 }, (_, minute) => ({ label: `${minute} min`, value: String(minute) })),
    [maxMinutes],
  );
  const secondOptions = React.useMemo<ComboboxOption[]>(
    () => Array.from({ length: Math.floor(secondCap(minutePart) / SECOND_STEP) + 1 }, (_, index) => ({
      label: `${String(index * SECOND_STEP).padStart(2, "0")} sec`,
      value: String(index * SECOND_STEP),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [minutePart, maxMinutes, limitSeconds],
  );

  const update = (minute: number, second: number) => {
    const total = minute * 60 + Math.min(second, secondCap(minute));
    onChange(total > 0 ? total : null);
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      <Combobox
        id="minutes-run"
        onChange={(value) => update(Number(value), secondPart)}
        options={minuteOptions}
        searchable={false}
        value={String(minutePart)}
      />
      <Combobox
        onChange={(value) => update(minutePart, Number(value))}
        options={secondOptions}
        searchable={false}
        value={String(secondPart)}
      />
    </div>
  );
}
