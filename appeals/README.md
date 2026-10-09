# LATCH — The Appeals Desk

[Play the game](https://cory56626-art.github.io/THEBOBSBATH/appeals/)

An original employee investigation game. Review 25 fictional ban appeals over five shifts. Open original conversations, reports, session logs, witness interviews, and technical audits. Pin decisive findings and sign a ruling: restore the account, uphold the ban, or escalate to a specialist. Each ruling receives an explained audit.

Cases grow from simple context mistakes to correlated account identities, compromised sessions, misleading replays, coordinated reports, fraudulent trades, research exceptions, and missing evidence. Later rulings require corroboration from more than one source.

Career mode ends at three incorrect rulings. Retry restores the start of the current shift while keeping earlier shifts. Practice mode removes dismissal and overtime penalties. Correct, substantiated files earn $55; correct rulings with weak reasons or evidence earn $35. Final accuracy, evidence quality, and integrity determine the desk assignment.

The shift clock advances only when retrieving a new record or submitting a ruling. Reading, rereading, writing notes, and consulting the handbook are free. Autosave stores career progress in this browser. The game works with mouse, keyboard, and touch; no account, backend, external libraries, build step, or remote requests are required.

## Controls

Use the appeal queue and the Appeal, Investigate, and Notes tabs. At the bottom of each retrieved record, tap a finding to pin or unpin it. Up to three findings may be cited. Select a ruling and reason, then Sign & submit. Open the handbook at any time for the fictional platform’s rules. H opens the handbook; Escape opens the save-and-leave dialog. Arrow keys switch focused case tabs. Desk sounds are optional and off by default.

## Source and verification

- `cases.mjs`: all 25 cases, five shifts, original records, decisive findings, and handbook.
- `engine.mjs`: progression, evidence access, audit scoring, time, retries, and save validation.
- `app.mjs`: accessible desk UI, touch interactions, settings, notes, and local autosave.
- `style.css`: responsive layouts and reduced-motion support.
- `tests/game.test.mjs`: case solvability, full-career completion, evidence requirements, save/reload, modes, overtime, and retry checks.
- `tests/ui.test.mjs`: application event and template integration checks using a simulated DOM; this does not measure browser layout.

Run `node --test appeals/tests/*.test.mjs` from the repository root. Serve the repository with a static HTTP server for development. The existing branch-based GitHub Pages build publishes the static `appeals/` directory.

LATCH, its platform, people, events, and policies are fictional. The policies are game rules, not instructions for any real platform.
