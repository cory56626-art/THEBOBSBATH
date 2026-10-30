# UI contract

The shell imports `src/app.js` and styles `src/style.css`. `src/board.js` exports `renderBoard(container, fen, options)`.

## Tabs

Buttons `[data-tab]` values `play`, `position`, `benchmark`, `controller`; matching `#panel-play`, `#panel-position`, `#panel-benchmark`, `#panel-controller`. Set `hidden` on inactive panels, `.active` and `aria-selected` on tabs. Default Play is active.

## Play controls

- `#board`: renderer container.
- `#mode`: `direct`, `search`, `selective`; default direct.
- `#side`: `w`, `b`, `watch`; default w.
- `#budget`: milliseconds 100, 250, 500 (default), 1000, 2000.
- `#node-limit`: 32, 64, 128 (default), 256.
- Buttons `#new-game`, `#undo`, `#flip`, `#play-engine`, `#copy-fen`.
- Live labels `#game-status`, `#turn-label`, `#move-list`, `#current-fen`, `#mode-description`.
- Player labels `#top-player`, `#bottom-player` contain `#top-player-detail`, `#bottom-player-detail`; preserve/rebuild nested labels if updating parent text.
- `#model-status`, `#model-detail` for loading, ready, errors.
- Metrics `#metric-time`, `#metric-nodes`, `#metric-confidence`, `#metric-gate`, `#decision-label`.

## Position lab

- `#fen-input`, `#load-fen`, `#compare-modes`, `#comparison-results`.
- `#pgn-input`, `#load-pgn`, `#export-pgn` (last is in Play panel).

## Benchmark

- `#suite-select`: placeholder quick / standard; app may replace options to match actual suites.
- `#run-suite`, `#cancel-run` (default disabled); shared cancellation can stop suites/matches/training.
- `#suite-progress`, `#benchmark-results`.
- `#pair-rounds`: 2 / 4 / 8; default 2.
- `#max-plies`: 40 / 80 / 160 / 240; default 80.
- `#run-matches`, `#match-progress`, `#match-results`.
- `#export-csv`, `#export-json`, global `#download-logs`.

## Controller

- `#controller-threshold`: range .1–.9 step .05, default .5; label output `#threshold-value`.
- `#train-controller`, `#reset-controller`, `#controller-progress`, `#controller-results`.

## Feedback and styling

- `#toast` hidden by default. Set text and hidden=false for transient feedback.
- Status classes `.error`, `.warning`, `.success`, `.muted`, `.small`.
- Result containers style tables, code, `.result-card` / `.comparison-card`, `.empty-card`.
- Native progress styles included. Long result tables scroll within their container.
- Board classes `.square.light/.dark`, `.selected`, `.last-move`, `.legal-target`, `.capture-target`; SVG pieces automatically sized. `.square-coordinate.rank-coordinate/.file-coordinate` for coordinates.
