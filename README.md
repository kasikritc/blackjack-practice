# Blackjack Practice

A local web app for practicing Hi-Lo blackjack card counting with automated hands, running-count quizzes, and SQLite practice analytics.

![Blackjack Practice gameplay](./docs/blackjack-gameplay.png)

## Quick Start

Clone the repo and enter the project:

```bash
git clone https://github.com/kasikritc/blackjack-practice.git
cd blackjack-practice
```

Install the runtime tools:

```bash
sudo apt install nodejs npm sqlite3
npm install
```

Set up the local analytics database:

```bash
mkdir -p data
sqlite3 data/blackjack.sqlite ".databases"
```

The server creates and migrates the SQLite schema automatically when it starts. The database lives at `data/blackjack.sqlite`, and `data/` is ignored by git.

Run the app:

```bash
npm run dev
```

The server binds to `0.0.0.0` on port `5173`. Open it locally at:

```text
http://localhost:5173
```

To run on a different port:

```bash
PORT=5174 npm run dev
```

## What It Includes

- Real shuffled shoes with configurable deck count and penetration.
- Visible-card-only Hi-Lo running count; the dealer hole card is counted only when revealed.
- Automated other players and dealer flow.
- Random, interval, end-of-round, and manual running-count quizzes.
- Mobile-friendly count-check modal with keypad, sign toggle, correction, equation, and card-by-card explanation.
- Configurable table, rule, speed, shoe display, and quiz settings saved in `localStorage`.
- Local SQLite analytics for sessions, shoes, hands, visible cards, count checks, response time, accuracy, streaks, and error patterns.

## Controls

- `New shoe` starts a freshly shuffled shoe.
- `Next hand` starts the next automated hand, or advances manual-step mode.
- `Pause` stops an active hand during deal/thinking waits and resumes from the same point.
- `Count check` manually opens the running-count prompt.
- `Settings` opens table, rule, speed, shoe display, and running-count quiz configuration.

Keyboard shortcuts:

- `N` or `Enter`: next hand or manual step
- `W`: new shoe
- `P` or `Space`: pause/resume
- `C`: count check; continue after count feedback
- `S`: settings; toggle sign inside the count prompt
- `A`: apply settings while the settings panel is open
- `Esc`: close settings

## Analytics Data

Practice analytics are stored locally in `data/blackjack.sqlite`. Tracking starts on by default when the app loads, but the SQLite session row is created only when the first visible card appears.

Turning tracking off preserves earlier data and stops recording new shoes, hands, visible cards, and count-check answers until it is turned back on. Sessions with visible cards but no count checks are retained for exposure and volume analytics.

See [`docs/analytics.md`](./docs/analytics.md) for the full SQLite analytics data dictionary. In analytics fields, `number_of_other_players` means automated non-user player seats only; it does not include the practitioner/user seat.
