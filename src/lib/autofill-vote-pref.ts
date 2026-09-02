/*
  Per-field "show autofill accuracy prompt" pref. Default on.
  Written by "Never show again"; a future settings menu can write a field back on.
*/

import { AUTOFILL_FIELDS, isAutofillField, type AutofillField } from "./autofill-feedback";

const STORAGE_KEY = "dqr-show-autofill-votes";

const listeners = new Set<() => void>();

export function parseHiddenAutofillFields(value: unknown): ReadonlySet<AutofillField> {
  if (value === "0") return new Set(AUTOFILL_FIELDS);
  if (typeof value !== "string" || value === "1") return new Set();
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return new Set();
    const hidden = new Set<AutofillField>();
    for (const entry of parsed) {
      if (typeof entry === "string" && isAutofillField(entry)) hidden.add(entry);
    }
    return hidden;
  } catch (err) {
    if (err instanceof SyntaxError) return new Set();
    throw err;
  }
}

export function subscribeShowAutofillVotes(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readHidden(): ReadonlySet<AutofillField> {
  if (typeof window === "undefined") return new Set();
  try {
    return parseHiddenAutofillFields(window.localStorage.getItem(STORAGE_KEY));
  } catch (err) {
    if (err instanceof DOMException) return new Set();
    throw err;
  }
}

export function readShowAutofillVote(field: AutofillField): boolean {
  return !readHidden().has(field);
}

export function writeShowAutofillVote(field: AutofillField, show: boolean): void {
  if (typeof window === "undefined") return;
  const hidden = new Set(readHidden());
  if (show) hidden.delete(field);
  else hidden.add(field);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]));
  } catch (err) {
    if (err instanceof DOMException) return;
    throw err;
  }
  for (const listener of listeners) listener();
}
