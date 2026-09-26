# Yahoo league

The Yahoo sheet and bound script are independent of ESPN. Shared source code lives in `apps-script`; `leagues/yahoo.json` supplies Yahoo-only defaults. Build files are generated in `build/yahoo`, never deployed from the ESPN folder. The completed ESPN draft code is tagged `espn-draft-2026-stable`. Its deployed script has not been updated for this work.

## League settings

14 teams, snake pick 8, no keepers. Roster: 2 C, 2 LW, 2 RW, 4 D, 1 G, 5 bench, 1 IR, 1 IR+. Sixteen draft picks per team; IR is not an additional draft slot. PAN uses a configurable 13-selection wait (actual snake waits alternate between 12 and 14 opponents).

Skaters: G 15, A 10, plus/minus 1, PIM 1, SOG 1, HIT 1, BLK 1, extra SHG 15 and SHA 10. No defense bonus. Goalies: W 10, SO 10, GA -5, SV 1.

Replacement defaults are **F110/D60/G20**. All forwards share a single pool, with each player counted once irrespective of C/LW/RW eligibility. The 110th-highest projected forward sets the forward replacement points, shown in Settings column C. PAR and Dom-only PAR use shared forward baselines; PAN uses a shared forward pool too. Full Yahoo eligibility stays visible. Baselines include drafted players. Refresh rebuilds Dom rank and sRk. The first refresh migrates the old C/LW/RW settings to replacementF=110; later edits are preserved.

## Data

`python3 scripts/fetch_yahoo.py --season 2026` retrieves public Yahoo data into `data/processed/yahoo.json`. The year is the season's **start** year. It discovers the current game key, validates the season, paginates in batches of 25, rejects duplicates/incomplete pools, and records retrieval time. It requires no login. Yahoo's public endpoint is undocumented; preserve the last good snapshot if it changes. Eligibility is from `eligible_positions`, never `eligible_positions_to_add`. League-specific commissioner overrides would need manual edits in Players.

Yahoo XRank comes from the user-supplied `data/raw/Yahoo Ranks.csv` (240 players), matched by normalized name to Yahoo IDs. The build rejects unmatched names, invalid ranks, and duplicates. Players outside that CSV remain blank. The public API snapshot still supplies ADP and eligibility; refreshing it does not discard the CSV ranks.

Default sADP is `(0.70 / ADP² + 0.15 / XRank² + 0.15 / DomRank²)^(-1/2)`. Missing components renormalize over those available. Settings uses `platformRankWeight=0.15`, `domRankWeight=0.15`, with the remaining 0.70 assigned to ADP. Refresh board ranks the full pre-draft pool by this blend to rebuild sRk; drafting filters availability without reranking. The first refresh after this update imports the CSV ranks and applies these weights once, preserving subsequent manual settings. It does not replace manual eligibility or ADP edits.

Extended categories are read from the existing raw files into the Yahoo build only. ESPN processed projections are preserved. Athletic SHA is SHP minus SHG; DtZ supplies SHG/SHA separately. Hits and SOG are provided by all seven sources; plus/minus by Athletic, DtZ and Cullen. Yahoo weights are Dom 8, DtZ 6, LineupExperts 6, Blake 4, Nate 4, Laidlaw 3, Cullen 3 (34 parts). All seven `projectionWeight…` settings are editable. Refresh board applies them to the Projections Weight column before recalculating. These settings override per-row weight edits in Yahoo only; ESPN remains at Dom 12/Cullen 2. Weights renormalize by category. Missing projections are not zero. The source comparison imputes missing categories from the blend and labels these cells with notes.

## Build and test

Install Python requirements (`python3 -m pip install -r requirements.txt`) and have Node available. `FH_PYTHON` can specify a Python executable; the build also recognizes the bundled desktop runtime.

```sh
npm run build:yahoo
npm test
```

Tests build the Yahoo files and check scoring, dual eligibility, replacement and PAN pools, complete Yahoo matching, draft-rank coverage, and unchanged ESPN calculations against the stable tag. `data/processed/yahoo-build-report.json` records source coverage and unmatched source names. Generated build files are ignored by Git. Scripts and source data are shared; each spreadsheet's targets, adjustments, settings and draft log are independent.

## Deployment

Local `leagues/yahoo-deployment.local.json` records the Yahoo `scriptId` and `spreadsheetId`. `build/yahoo/.clasp.json` must point to that script. Neither local file is committed. The deployment command checks this target against the ESPN `.clasp.json` and refuses to push to the ESPN project.

```sh
npm run deploy:yahoo
```

For a new sheet, run `setupDraftSheet` in its bound Apps Script editor once and authorize access to that spreadsheet. Reload the spreadsheet for the Draft menu. Existing Yahoo sheets need **Draft > Refresh board** after a code push. After updating the embedded Yahoo data, use **Draft > Import Yahoo snapshot** to replace eligibility/ADP and refresh.

The first setup creates a hidden empty Keepers tab for shared draft formulas; this league rejects keeper entries. Refresh overwrites Board Snapshot with values and formatting. Draft/undo only updates Draft Log and native sheet formulas.

There are no minimum goalie appearances. Replacement defaults are the user-selected F110/D60/G20; they remain editable.

## Recreate a sheet

Choose **File > Make a copy** in the existing Yahoo spreadsheet. The copy includes its bound Apps Script. Open the copy, reload if needed, and choose **Draft > Refresh board**; authorize the script if Google asks. To start a fresh draft, clear the entries below the header in Draft Log and review Settings, Targets and Adjustments. A copy retains the source projections and Yahoo snapshot; it does not automatically fetch a new season. No script pasting is needed. Local CLI deployment still targets the original Yahoo script until its local deployment configuration is explicitly changed.
