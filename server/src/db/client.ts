import fs from "node:fs";
import Database from "better-sqlite3";
import { DB_DIR, DB_PATH } from "../config.js";

fs.mkdirSync(DB_DIR, { recursive: true });

export const db: Database.Database = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

export type Row = Record<string, any>;

/** Run one or more SQL statements with no result (schema, migrations, deletes). */
export function runSql(sql: string): void {
  db.exec(sql);
}

/** Run a single SELECT and return all rows as plain objects. */
export function queryAll(sql: string): Row[] {
  return db.prepare(sql).all() as Row[];
}

/** Read a single scalar aliased as `value` (used for COUNT(*) AS value queries). */
export function firstValue(sql: string): number {
  const rows = queryAll(sql);
  return Number(rows[0]?.value || 0);
}

function toParam(value: unknown): number | string | bigint | Buffer | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint" || Buffer.isBuffer(value)) return value;
  return String(value);
}

/** Insert a row, ignoring undefined columns; returns the new row id. */
export function insert(table: string, values: Record<string, unknown>): { id: number } {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  const columns = entries.map(([key]) => key).join(", ");
  const placeholders = entries.map(() => "?").join(", ");
  const params = entries.map(([, value]) => toParam(value));
  const info = db
    .prepare(`INSERT INTO ${table} (${columns}) VALUES (${placeholders})`)
    .run(...params);
  return { id: Number(info.lastInsertRowid) };
}

/** Update a row by id, ignoring undefined columns. */
export function update(table: string, id: unknown, values: Record<string, unknown>): void {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  if (!entries.length) return;
  const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
  const params = entries.map(([, value]) => toParam(value));
  db.prepare(`UPDATE ${table} SET ${assignments} WHERE id = ?`).run(...params, Number(id));
}

/** SQLite literal for inline SQL (kept for the seed queries that interpolate names). */
export function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replace(/'/g, "''")}'`;
}
