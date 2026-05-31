import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Repo root (…/blackjack-practice). server/dist/config.js and server/src/config.ts
 * are both two levels below the root, so this resolves correctly in dev and prod. */
export const ROOT = path.resolve(__dirname, "..", "..");

export const PORT = Number(process.env.PORT || 5173);

const devClientPort = process.env.DEV_CLIENT_PORT ? Number(process.env.DEV_CLIENT_PORT) : null;
export const DEV_CLIENT_PORT =
  devClientPort && Number.isFinite(devClientPort) ? devClientPort : null;

export const DATA_DIR = path.join(ROOT, "data");

/** Defaults to data/blackjack.sqlite; override with BLACKJACK_DB_PATH (used by tests). */
export const DB_PATH = process.env.BLACKJACK_DB_PATH
  ? path.resolve(process.env.BLACKJACK_DB_PATH)
  : path.join(DATA_DIR, "blackjack.sqlite");

export const DB_DIR = path.dirname(DB_PATH);

/** Built client assets served in production (npm run build && npm start). */
export const CLIENT_DIST = path.join(ROOT, "client", "dist");
