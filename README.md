# fh-manager

Fantasy hockey projections and a Google Sheets draft board. Google Apps Script builds the sheet; formulas filter drafted players immediately. The local script is connected using clasp, so future code changes do not require copying files.

## Apply updates

After a script push, reload the spreadsheet and choose **Draft > Refresh board**. This migrates input layouts and rebuilds calculations while preserving player data, settings, targets, and Draft Log. To load the dated ESPN snapshot, choose **Draft > Import ESPN snapshot**; this replaces matched ESPN POS/ADP/rank fields and refreshes Board.

For a new sheet, create a blank Google Sheet, open Extensions > Apps Script, add the `.gs` files in apps-script and the supplied manifest, and run `setupDraftSheet`. For local deployment, install clasp, run `clasp login`, enable the Apps Script API in https://script.google.com/home/usersettings, and create an ignored `apps-script/.clasp.json` with `{"scriptId":"YOUR_SCRIPT_ID","rootDir":"."}`. Run `clasp push` from apps-script. Back up remote scripts before a first push. No separate Google Cloud project is required.

## Draft-night use

- **Keepers:** type player names only. They are unavailable immediately, with no required team, round, or reserved pick. Old team/round information is archived in a hidden tab during migration. Name checks flag unknown players. Keeper exclusions do not advance the selection counter.
- **Targets:** names in Targets turn orange; names in Fades turn grey. Fade takes precedence if both apply. Names are checked against Players and normalized for case/outer spaces.
- **Draft:** select one player cell on Board and use Draft selected player, or macro shortcut 1. Undo is shortcut 2. Check the Mac key combination under Extensions > Macros > Manage macros.
- Draft and undo only change Draft Log. Board formulas recalculate. Clearing logged data rows restores players except keepers; preserve the header row. The selection counter counts logged entries, accommodating older logs with gaps from the former keeper-cost model.

Board columns are Player, POS (forwards only), Tm, Age, Rk (ESPN rank), sADP, PAR, PAN. Age is taken from the Athletic workbook, not recalculated from birthdays. Ages at or below `youngAgeMax` (default 23) are pale yellow. Change that cutoff in Settings; the highlighting updates automatically. Internal IDs remain hidden. Width is approximately 1,160 pixels at 100% zoom, plus Sheets row headers and browser chrome.

ESPN rank uses a red gradient and sADP a blue gradient, each highlighting about the lowest 12 values across the whole board. Refresh sets the percentile from the number of available numeric values; as drafting progresses the highlighted count can shrink slightly until refreshed. PAR retains a purple gradient for the highest 15%. PAN is white at zero or below and graduates to green above zero. All displayed numeric metrics round to whole values; calculations retain precision.

## Scoring and PAR

Skaters: `3 G + 1.5 A + 0.3 BLK + 0.5 PIM + 1.5 SHP`. Defensemen receive another `0.3 × (G + A)`. Goalies: `1.5 W + 2 SO − GA + 0.2 SV`. Scoring is editable in Settings; refresh after changes.

League: 12 teams, initial draft slot 1, snake order, roster of 2 C / 2 LW / 2 RW / 3 D / 1 skater FLEX / 1 G / 5 bench / 1 IR. IR is not an extra draft slot. With names-only keepers, no keeper ownership or cost-round scheduling is inferred. Total open selections are 16 × teams minus unique keeper count.

PAR is points above the player at the configured positional replacement rank. Defaults: C32, LW32, RW32, D32, G20. These are ranks, not point values. Change them in Settings. A multi-position player receives their highest eligible PAR. Baselines include drafted and kept players, so they do not drift during the draft. ESPN eligibility is preferred; workbook positions are a provisional fallback marked `*`. An insufficient eligible pool leaves PAR blank.

## Smart ADP and PAN

First calculate `base = ESPN ADP^(1 − espnRankWeight) × ESPN rank^espnRankWeight`. Then apply `sADP = base × positional multiplier × (base / curvePivot)^(position exponent − 1)`.

Defaults give ADP 75% weight and ESPN rank 25% weight. F uses multiplier 1.00/exponent 1; D uses 0.86/1; G uses 0.65/1.235 with `curvePivot` 50. This makes elite goalies move earlier more strongly than later goalies. If one input is missing, use the other as the base; if both are missing, leave sADP blank. Original ADP remains in Players and Board Data. ESPN rank comes from `draftRanksByRankType.STANDARD.rank`, not ratings.totalRanking or custom manager rankings.

D/G multipliers minimize squared differences in cumulative D/G counts at the end of rounds 1–9 between the supplied prior draft and the order implied by the CURRENT ESPN 50/50 blend. The joint search spans 0.50–1.50 in 0.01 steps, holding F at 1; ties favour factors closest to 1. This transfers assumed positional demand to the current player pool, not historical per-player ADP accuracy. A constant factor cannot reproduce every round exactly. Run `python3 scripts/calibrate_positions.py PRIVATE_HISTORY.json` to reproduce the procedure. Private league history stays untracked.

PAN estimates `positional PAR − expected best available PAR` after a **fixed 22-selection wait**, including when your own selections are consecutive. `panGap` defaults to 22 and does not alternate with snake-pick distance. Survival uses a normal distribution centred on sADP, conditional on still being available now. Its uncertainty grows with draft rank: `MAX(adpSigmaFloor, adpSigmaRate × sADP)`, defaulting to 4 picks or 18% of sADP.

Separate C/LW/RW/D/G pools calculate one shared expected best available PAR per position. The calculation includes every player’s chance of surviving, including the candidate, matching FF-Manager. Drafted/kept players have zero availability, and zero PAR is the fallback when everyone above replacement disappears. Multi-position players receive the highest eligible positional PAN. Missing sADP in a relevant pool leaves PAN blank. The formulas are inspectable in hidden Board Data and PAN Pools. There are no PAN simulations or custom-function runtime limits. Independence and normally distributed selection timing are simplifying assumptions; this does not model individual opponent rosters or auto-drafters explicitly.

Change blend weights/multipliers/uncertainty to recalculate live. Refresh after changing projections, scoring, replacement ranks, or player eligibility. Keepers, Draft Log, and Targets/Fades update live.

## Data

`python3 scripts/import_athletic.py ~/Downloads/2026-27-Fantasy-Projections-Yahoo.xlsx` imports cached **The List** season totals, source adjustments, and Age. It does not import the source's fantasy scores or KEEP? flags. Missing scored stats fail loudly. Additional sources can be added to Projections with the same ID and nonnegative weights. Each statistic blends only sources supplying that statistic. Do not duplicate a player/source. The Player column shows names for inspection.

`python3 scripts/fetch_espn.py --season 2027` retrieves ESPN's public draft pool and creates a dated snapshot. Run tests, push the script files, then import the snapshot from the sheet. The September 6 snapshot contains 1,686 players, 377 rank entries, and matches all 670 Athletic players using exact normalized names plus 19 reviewed ESPN-ID aliases. Missing ranks stay blank. The endpoint is undocumented and may change. The importer rejects missing ADP and a full 2,000-player response requiring pagination.

The raw Athletic workbook, extracted projections and generated projection script are publicly versioned at the owner's request. Source data remains attributed to The Athletic; this repository does not grant rights to third-party data. Private league draft history is excluded from Git.

## Validation and references

Run `npm test` with Node 18+. Tests cover scoring, names-only keepers, fixed-gap PAN, blend arithmetic, shared expected-best calculations, identity matching, live filtering and layout. Live Sheets rendering and execution speed should also be checked after refresh.

- ESPN source: https://lm-api-reads.fantasy.espn.com/apis/v3/games/fhl/seasons/2027/segments/0/leaguedefaults/1?view=kona_player_info
- ESPN eligibility: https://support.espn.com/hc/en-us/articles/360054126392-Position-Eligibility
- Google Sheets macros: https://developers.google.com/apps-script/guides/sheets/macros
