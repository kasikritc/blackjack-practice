# Blackjack Practice

Mobile-friendly Hi-Lo blackjack card counting practice app with local SQLite analytics. It runs as a one-user local web app served by a small Node server.

## Run

```bash
cd /home/kasikritc/blackjack-practice
npm run dev
```

Open `http://<your-machine-ip>:5173` from a phone on the same network.

To find the machine IP:

```bash
hostname -I
```

## What v0.0.1 Includes

- Real shuffled shoe with 1, 2, 4, 6, or 8 decks.
- Default 6-deck shoe and 75% penetration.
- Cut-card detection and shuffle flow.
- Visible-card-only Hi-Lo running count.
- Dealer hole card is not counted until revealed.
- Automated other players and dealer flow with semi-oval table seating.
- Random, interval, end-of-round, and manual running-count quizzes.
- Mobile count-check modal with a numeric keypad, sign toggle, correction, running-count equation, and card-by-card explanation.
- Configurable table and house-rule settings saved in `localStorage`.
- Shoe/discard display modes for rounded decks left, exact card counts, visual tray estimation practice, or hidden shoe info.
- Adjustable deal delay, player thinking delay, dealer pause delay, and automatic count-quiz pause.
- Beginner speed presets including `First lesson` and `Learning pace`.
- Tooltip explanations for penetration, dealer peek, and DAS.
- Real pause/resume during an active round.
- Keyboard shortcuts for desktop/laptop practice.
- Local SQLite analytics for one-user practice tracking.
- Default-on tracking per app session with an on/off toggle.
- Analytics dashboard for mastery score, accuracy, average error, response speed, streaks, card volume, shoe-depth performance, count-pressure performance, prompt-type performance, trends, and recent sessions.
- Exact per-quiz card tracking so misses can be reviewed by low cards, high cards, neutral cards, and dealer hole-card reveals.

## Controls

- `New shoe` starts a freshly shuffled shoe.
- `Next hand` starts the next automated hand, or advances manual-step mode.
- `Pause` stops an active hand during deal/thinking waits and resumes from the same point.
- `Count check` manually opens the running-count prompt.
- `Settings` opens table, rule, speed, shoe display, and running-count quiz configuration.
- Speed preset, delay, quiz pause, and shoe display changes take effect immediately; other settings apply when you press `Apply and shuffle`.

Keyboard shortcuts:

- `N` or `Enter`: next hand or manual step
- `W`: new shoe
- `P` or `Space`: pause/resume
- `C`: count check; continue after count feedback
- `S`: settings; toggle sign inside the count prompt
- `A`: apply settings while the settings panel is open
- `Esc`: close settings

This version intentionally does not include accounts, real money, bankroll/betting UI, leaderboards, betting spread training, bankroll analysis, deviations, or multiple training modes.

## Analytics Data

Practice analytics are stored locally in `data/blackjack.sqlite`. The `data/` directory is ignored by git.

Tracking starts on by default when the app loads. Turning tracking off preserves earlier data and stops recording new shoes, hands, visible cards, and count-check answers until it is turned back on.

Each submitted count check stores the exact visible-card sequence since the previous quiz. This powers error-driver analysis for low-card, high-card, neutral-card, and dealer-hole-reveal patterns.

Each visible card also stores the speed settings active at the moment it appeared, plus the elapsed time since the previous visible card. This preserves mid-shoe speed changes for later accuracy analysis.
