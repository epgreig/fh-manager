# fh-manager

Fantasy hockey projections and a Google Sheets draft board. Google Apps Script builds the sheet; formulas filter drafted players immediately. The local script is connected using clasp, so future code changes do not require copying files.

## Apply updates

After a script push, reload the spreadsheet and choose **Draft > Refresh board**. This migrates input layouts and rebuilds calculations while preserving player data, settings, targets, and Draft Log. To load the dated ESPN snapshot, choose **Draft > Import ESPN snapshot**; this replaces matched ESPN POS/ADP/rank fields and refreshes Board.

For a new sheet, create a blank Google Sheet, open Extensions > Apps Script, add the `.gs` files in apps-script and the supplied manifest, and run `setupDraftSheet`. For local deployment, install clasp, run `clasp login`, enable the Apps Script API in https://script.google.com/home/usersettings, and create an ignored `apps-script/.clasp.json` with `{"scriptId":"YOUR_SCRIPT_ID","rootDir":"."}`. Run `clasp push` from apps-script. Back up remote scripts before a first push. No separate Google Cloud project is required.

## Draft-night use

- **Keepers:** type player names only. They are unavailable immediately, with no required team, round, or reserved pick. Old team/round information is archived in a hidden tab during migration. Name checks flag unknown players. Keeper exclusions do not advance the selection counter.
- **Targets:** names in Targets turn orange; names in Fades turn grey. Fade takes precedence if both apply. Names are checked against Players and normalized for case/outer spaces.
- **Draft:** select one player cell on Board and use Draft selected player, or macro shortcut 1. Undo is shortcut 2. Check the Mac key combination under Extensions > Macros > Manage macros.
- Draft and undo only change Draft Log. Player identities are cached (and invalidated by Players edits); keeper and duplicate checks still read current inputs. The pick counter, next-pick calculation, and PAN gap use native Sheets formulas, avoiding a second Apps Script invocation after each pick. Board formulas recalculate. Clearing logged data rows restores players except keepers; preserve the header row. The selection counter counts logged entries, accommodating older logs with gaps from the former keeper-cost model.

Board columns are Player, POS (forwards only), Tm, Age, Rk (ESPN rank), sADP, PAR, PAN. Age is taken from the Athletic workbook, not recalculated from birthdays. Ages at or below `youngAgeMax` (default 23) are pale yellow. Change that cutoff in Settings; the highlighting updates automatically. Internal IDs remain hidden. Width is approximately 1,160 pixels at 100% zoom, plus Sheets row headers and browser chrome.

Rk (ESPN rank), ADP, and DomRk sit beside one another and are hidden by default. They share one red gradient across all three position groups, using a pooled cutoff for roughly 12 low values per input. sADP has a separate blue gradient highlighting roughly the lowest 12 values. Refresh sets the percentile from the number of available numeric values; as drafting progresses the highlighted count can shrink slightly until refreshed. PAR retains a purple gradient for the highest 15%. PAN is white at zero or below and graduates to green above zero. All displayed numeric metrics round to whole values; calculations retain precision.

## Scoring and PAR

Skaters: `3 G + 1.5 A + 0.3 BLK + 0.5 PIM + 1.5 SHP`. Defensemen receive another `0.3 × (G + A)`. Goalies: `1.5 W + 2 SO − GA + 0.2 SV`. Scoring is editable in Settings; refresh after changes.

League: 12 teams, initial draft slot 1, snake order, roster of 2 C / 2 LW / 2 RW / 3 D / 1 skater FLEX / 1 G / 5 bench / 1 IR. IR is not an extra draft slot. With names-only keepers, no keeper ownership or cost-round scheduling is inferred. Total open selections are 16 × teams minus unique keeper count.

Forward PAR uses one shared baseline: **season fantasy points minus `replacementFPoints`**, initially 161 points. Adjust this point value in Settings and refresh. D and G continue to use positional replacement ranks; their existing settings are preserved. Baselines include drafted and kept players. Forward PAR no longer varies with C/LW/RW eligibility.

On the first refresh, the former C/LW/RW ranks are saved in document properties (`panForwardReplacementRanks`) and removed from Settings. Those archived ranks are no longer used. PAN now uses the shared forward baseline and one combined forward pool. ESPN eligibility remains preferred, with workbook positions as the provisional fallback.

## Smart ADP and PAN

The default is `sADP = ESPN rank^0.2 × ESPN ADP^0.4 × Dom rank^0.4`. Settings `espnRankWeight` and `domRankWeight` are direct shares; ADP gets the remainder. The two settings must sum to at most 1. Missing inputs have their weights redistributed proportionally among available inputs; no available weighted inputs leaves sADP blank. Original ADP remains in Players and Board Data. ESPN rank comes from `draftRanksByRankType.STANDARD.rank`.

**Dom rank (league PAR)** uses The Athletic's category projections alone, scored under current league Settings, including the defense scoring bonus. Forwards subtract the shared `replacementFPoints` baseline. Defensemen and goalies subtract Dom's own projected points at the configured `replacementD` and `replacementG` ranks. All players are then ranked together by that PAR, including keepers and drafted players; ties share rank. Incomplete projections or an unavailable positional baseline leave Dom rank blank. See column J of Players; refresh after changing scoring, replacement settings, or Dom's stats. This signal is independent of Dom's weight in the projection blend.

Optional positional corrections apply **after the complete blend**: `base × multiplier × (base / curvePivot)^(exponent − 1)`. All multipliers and exponents now default to 1, leaving the requested blend unchanged. The first refresh after this update sets the new weights and clears the old positional corrections once; subsequent manual changes are preserved.

Reevaluation compared cumulative D/G counts through round 9 of the prior draft with the complete new blend, using F = 161 points, D40 and G20. Across the September 6 and September 18 ESPN snapshots, the best simple multiplier fit was D = 1.04 and G = 0.78–0.82. This argues against the old defense boost; goalies still tend to be too late, and an optional G multiplier near 0.8 improves the aggregate fit. It does not fix every round. Defaults remain neutral pending that choice. This comparison transfers prior positional demand to the current player pool; it is not a historical player-by-player backtest, and includes keeper acquisitions whose flags are unknown.

Reproduce with `node scripts/calibrate_sadp.cjs PRIVATE_HISTORY.json [ESPN.json] [D rank] [G rank] [F points]`. The script compares no correction, the old constants applied to the complete new blend, and fitted simple multipliers. Private league history stays untracked.

PAN estimates `group PAR − expected best available PAR` after a **fixed 22-selection wait**, including when your own selections are consecutive. `panGap` defaults to 22 and does not alternate with snake-pick distance. Survival uses a normal distribution centred on sADP, conditional on still being available now. Its uncertainty grows with draft rank: `MAX(adpSigmaFloor, adpSigmaRate × sADP)`, defaulting to 4 picks or 18% of sADP.

Separate F/D/G pools calculate one shared expected best available PAR per group. Every forward is counted once regardless of C/LW/RW eligibility. The calculation includes every player’s chance of surviving, including the candidate, matching FF-Manager. Drafted/kept players have zero availability, and zero PAR is the fallback when everyone above replacement disappears. All forwards subtract the same expected-best value, so their PAN order follows their projected points. Missing sADP in a relevant pool leaves PAN blank. The formulas are inspectable in hidden Board Data and PAN Pools. There are no PAN simulations or custom-function runtime limits. Independence and normally distributed selection timing are simplifying assumptions; this does not model individual opponent rosters or auto-drafters explicitly.

Change blend weights/multipliers/uncertainty to recalculate live. Refresh after changing projections, scoring, replacement ranks, or player eligibility. Keepers, Draft Log, and Targets/Fades update live.

## Data

**Projection Comparison** shows one row per player with the weighted blend's fantasy points, each active source's fantasy total, unweighted population standard deviation, Relative SD (standard deviation divided by the unweighted source average), range, and source count. Relative SD is formatted as a percentage and stays blank for nonpositive averages; near-zero averages can exaggerate it. Sort using the header filter. Totals use your Settings scoring, including the defense bonus. Missing scored categories are filled with that player's weighted category blend; hover source cells to see which categories were filled. A missing player/source stays blank, and sources with zero weight are excluded. Standard deviation and range stay blank with fewer than two sources. This measures disagreement between projection models, not the player's complete range of outcomes; shared inputs and missing-category filling can reduce the spread. Refresh board after changing projections, weights, or scoring to rebuild this tab.

`python3 scripts/import_athletic.py ~/Downloads/2026-27-Fantasy-Projections-Yahoo.xlsx` imports cached **The List** season totals, source adjustments, and Age. It does not import the source's fantasy scores or KEEP? flags. Missing scored stats fail loudly.

`python3 scripts/import_secondary.py` normalizes DtZ, LineupExperts, Scott Cullen, Steve Laidlaw, and the separate Apples & Ginos Blake and Nate files to Athletic player IDs. Install `requirements.txt` first. It imports season totals, not the sources' fantasy-point, VORP, rank, or positional calculations. Refreshing an existing sheet adds matched rows to Projections once and removes retired Hashtag Hockey rows, which duplicate DtZ. Raw Hashtag downloads remain archived but are not imported. The requested weights are **Athletic 12 parts; DtZ 6; LineupExperts 6; Blake 4; Nate 4; Laidlaw 3; Cullen 2** (37 parts total). Refresh applies these weights once; later manual edits remain editable. Each stat blends only sources supplying it and renormalizes their weights: Apples & Ginos supply GP/G/A/BLK/PIM but no SHP or goalie stats; Laidlaw supplies GP/G/A/BLK for skaters only. LineupExperts supplies GP/G/A/BLK/PIM for skaters only; DtZ supplies all scored skater and goalie categories. Source fantasy totals and ADP are ignored. Missing source rows leave the remaining sources to carry that player. Matching removes accents, punctuation, whitespace, and case, then applies a small list of reviewed name aliases; ambiguous names are never matched by surname alone. All of the first 150 rows in both Apples & Ginos lists and Laidlaw's Skaters list match. Names that cannot be matched safely are listed in `data/processed/secondary-projections.json`. The Player column shows names for inspection. You can adjust any source weight in Projections and refresh.

`python3 scripts/fetch_espn.py --season 2027` retrieves ESPN's public draft pool and creates a dated snapshot. Run tests, push the script files, then import the snapshot from the sheet. The September 6 snapshot contains 1,686 players, 377 rank entries, and matches all 670 Athletic players using exact normalized names plus 19 reviewed ESPN-ID aliases. Missing ranks stay blank. The endpoint is undocumented and may change. The importer rejects missing ADP and a full 2,000-player response requiring pagination.

The raw Athletic and Steve Laidlaw workbooks and downloaded DtZ, LineupExperts, Scott Cullen, Hashtag Hockey, and Apples & Ginos CSVs, extracted projections, and generated script data are publicly versioned at the owner's request. Source data remains attributed to its creators; this repository does not grant rights to third-party data. Private league draft history is excluded from Git.

## Validation and references

Run `npm test` with Node 18+. Tests cover scoring, names-only keepers, fixed-gap PAN, blend arithmetic, shared expected-best calculations, identity matching, live filtering and layout. Live Sheets rendering and execution speed should also be checked after refresh.

- ESPN source: https://lm-api-reads.fantasy.espn.com/apis/v3/games/fhl/seasons/2027/segments/0/leaguedefaults/1?view=kona_player_info
- ESPN eligibility: https://support.espn.com/hc/en-us/articles/360054126392-Position-Eligibility
- Google Sheets macros: https://developers.google.com/apps-script/guides/sheets/macros
