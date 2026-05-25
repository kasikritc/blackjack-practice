# Blackjack Practice

A local full-stack web app for practicing Hi-Lo blackjack card counting and basic strategy. Three drills — an automated **Table Practice** shoe, a **Flash Count** speed drill, and a **Basic Strategy** decision trainer — each at its own route, backed by a typed REST API and local SQLite analytics.

![Blackjack Practice gameplay](./docs/blackjack-gameplay.png)

## Architecture

This is an npm-workspaces monorepo with a clean front-end / back-end split and a shared type package:

```
blackjack-practice/
├── shared/   @blackjack/shared — TypeScript types shared by client and server
├── server/   @blackjack/server — Express + better-sqlite3 REST API
├── client/   @blackjack/client — React + Vite single-page app (client-side routing)
└── data/     blackjack.sqlite (created on first run; git-ignored)
```

- **Backend** — Express (TypeScript) serving a JSON API under `/api`, persisting to SQLite via the `better-sqlite3` driver. Routes are split by resource (`sessions`, `events`, `strategy`, `analytics`); analytics aggregation lives in `server/src/services`. In production the server also serves the built client and falls back to `index.html` so deep links work.
- **Frontend** — React + Vite. Each drill is a route with its own URL (see below). Game logic lives in framework-agnostic engine modules (`client/src/features/*`) driven by React. Settings persist to `localStorage`.
- **Shared** — request/response DTOs, domain types (cards, Hi-Lo), strategy and settings shapes, used by both sides for end-to-end type safety.

### Routes

| Drill               | Path              |
| ------------------- | ----------------- |
| Home (drill picker) | `/`               |
| Table Practice      | `/table-practice` |
| Flash Count         | `/flash-count`    |
| Basic Strategy      | `/basic-strategy` |

Routing uses the History API, so the browser back/forward buttons work and each drill is bookmarkable and shareable.

## Quick start

Requires Node 18+ and `sqlite3` on `PATH`.

```bash
git clone https://github.com/kasikritc/blackjack-practice.git
cd blackjack-practice
npm install
npm run dev
```

`npm run dev` builds the shared types, then runs the API server (port `5173`) and the Vite dev server (port `5174`) together. Open:

```text
http://localhost:5174
```

The Vite dev server proxies `/api` requests to the Express server. The SQLite schema is created and migrated automatically on first run; the database lives at `data/blackjack.sqlite` (git-ignored). Override its location with `BLACKJACK_DB_PATH`.

### Production build

```bash
npm run build   # builds shared → server → client
npm start       # serves the built client + API on http://localhost:5173
```

## Scripts

| Command             | Description                               |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Run server + client in watch mode         |
| `npm run build`     | Build all three workspaces                |
| `npm start`         | Serve the production build on port `5173` |
| `npm run typecheck` | Type-check server and client              |
| `npm run lint`      | Lint the whole repo                       |
| `npm run format`    | Format with Prettier                      |

`./start-blackjack-practice.sh` / `./stop-blackjack-practice.sh` (and the `bin-*` wrappers) launch and stop the dev servers in the background.

## Drills

- **Table Practice** — real shuffled shoes with configurable deck count and penetration, automated other players and dealer flow, a visible-card-only Hi-Lo running count (the dealer hole card counts only when revealed), and random/interval/end-of-round/manual count quizzes.
- **Flash Count** — a configurable number of cards (default 2–5) flash briefly then hide; call the Hi-Lo count of just that hand. Each round is independent and resets the count.
- **Basic Strategy** — two-card decision drills against every dealer upcard, using selectable rule profiles, basic-strategy charts, and focus subsets (pairs only, softs only, dealer 2–6, etc.) seeded by the server.

### Controls & shortcuts

- Table Practice: **Next hand** (`N`/`Enter`), **New shoe** (`W`), **Pause/Resume** (`P`/`Space`), **Count check** (`C`), **Settings** (`S`).
- Flash Count: **Deal** (`N`/`Enter`).
- Basic Strategy: **Next prompt** (`N`/`Enter`); actions **Hit** (`A`), **Stand** (`S`), **Double** (`D`), **Split** (`F`), **Surrender** (`R`), **Insurance** (`E`).
- In the count prompt, `D` toggles the count sign and `Enter` submits / continues.

## Analytics

Practice analytics are stored locally in `data/blackjack.sqlite`. Tracking is on by default; a session row is created on the first recorded event. Each drill surfaces its own analytics panel (mastery score, accuracy, streaks, trends, breakdowns). Table and Flash data are stored in separate tables, so resetting one does not affect the other.

The REST contract and SQLite schema are unchanged from the original single-file app, so analytics collected before this refactor remain valid. See [`docs/analytics.md`](./docs/analytics.md) for the full data dictionary. In analytics fields, `number_of_other_players` counts automated seats only, not the user's seat.
