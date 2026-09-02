import { Database } from "bun:sqlite";

import type { AutofillField } from "../src/lib/autofill-feedback";

export type FieldFeedbackResult = "ok" | "duplicate" | "missing";

export type Aggregate = {
  readonly itemsCalculated: number;
  readonly feedbackTotal: number;
  readonly feedbackAccurate: number;
  readonly accuracy: number | null;
};

export type StatsStore = {
  readonly insertCalculation: (rawText: string | null, processedText: string | null) => number;
  readonly applyFieldFeedback: (
    calculationId: number,
    field: AutofillField,
    accurate: boolean,
  ) => FieldFeedbackResult;
  readonly readAggregate: () => Aggregate;
};

function columnNames(db: Database, table: string): readonly string[] {
  return db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all().map((row) => row.name);
}

export function openStatsStore(db: Database): StatsStore {
  db.run(`
    CREATE TABLE IF NOT EXISTS calculations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      accurate INTEGER,
      verification TEXT,
      ocr_raw_text TEXT,
      ocr_processed_text TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS field_feedback (
      calculation_id INTEGER NOT NULL,
      field TEXT NOT NULL,
      accurate INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (calculation_id, field)
    );
    CREATE INDEX IF NOT EXISTS idx_calculations_accurate ON calculations(accurate);
  `);
  const columns = columnNames(db, "calculations");
  if (!columns.includes("ocr_raw_text")) db.run("ALTER TABLE calculations ADD COLUMN ocr_raw_text TEXT");
  if (!columns.includes("ocr_processed_text")) {
    db.run("ALTER TABLE calculations ADD COLUMN ocr_processed_text TEXT");
  }

  const insertCalculationStmt = db.query(
    "INSERT INTO calculations (accurate, verification, ocr_raw_text, ocr_processed_text) VALUES (NULL, NULL, ?1, ?2)",
  );
  const countCalculations = db.query<{ total: number }, []>("SELECT COUNT(*) AS total FROM calculations");
  const feedbackTotals = db.query<{ total: number; accurate: number }, []>(
    "SELECT COUNT(*) AS total, COALESCE(SUM(accurate), 0) AS accurate FROM field_feedback",
  );
  const hasCalculation = db.query<{ ok: number }, [number]>("SELECT 1 AS ok FROM calculations WHERE id = ?1");
  const insertFeedback = db.query(
    "INSERT OR IGNORE INTO field_feedback (calculation_id, field, accurate) VALUES (?1, ?2, ?3)",
  );

  return {
    applyFieldFeedback(calculationId, field, accurate) {
      if (hasCalculation.get(calculationId) == null) return "missing";
      const { changes } = insertFeedback.run(calculationId, field, accurate ? 1 : 0);
      return changes === 0 ? "duplicate" : "ok";
    },
    insertCalculation(rawText, processedText) {
      const { lastInsertRowid } = insertCalculationStmt.run(rawText, processedText);
      return Number(lastInsertRowid);
    },
    readAggregate() {
      const items = countCalculations.get()?.total ?? 0;
      const feedback = feedbackTotals.get();
      const feedbackTotal = feedback?.total ?? 0;
      const feedbackAccurate = feedback?.accurate ?? 0;
      return {
        accuracy: feedbackTotal > 0 ? Math.round((feedbackAccurate / feedbackTotal) * 1000) / 10 : null,
        feedbackAccurate,
        feedbackTotal,
        itemsCalculated: items,
      };
    },
  };
}
