# Fantasy team management

An independent workbook with three tabs: **Rosters**, **Players**, and **Schedule**.
It does not deploy to or change either draft spreadsheet.

- Enter one ESPN roster in `Rosters!A5:A28` and one Yahoo roster in `J5:J28`.
  Names have a Players dropdown; invalid names, duplicates and invalid adjustments are flagged.
- Optional Adj multipliers are in F and O. Blank means 1; 0.75 cuts the projection
  by 25%; 1.10 adds 10%. Zero is a valid adjustment.
- Players uses the existing league builds and scoring engine. Source statistics
  are blended per category, renormalizing weights over available sources.
  ESPN parts: Dom 12, DtZ 6, LE 6, Blake 4, Nate 4, Laidlaw 3, Cullen 2.
  Yahoo parts: Dom 8, Cullen 3, others unchanged. Personal draft cuts are excluded.
- ESPN uses its saved projection payload; Yahoo uses its separately generated
  payload. Eligibility uses the corresponding platform snapshot. This is a
  projection snapshot, not live season results or a link to the draft sheets.
- Skater FP/g divides season fantasy points by projected player games. Goalie
  FP/g divides by team season games (`Players!B3`, initially 84) to account for
  their projected share of starts when multiplying by team games per week.
- Paste team game counts into `Schedule!E63:AE94`, aligned with the team codes
  in B. Headers in E62:AE62 are editable. Blank counts mean unknown; zero means
  no games. Both forecast sections update automatically from roster edits.
- Forecasts show full-roster potential. They do not optimize daily starts or
  deduct bench limits, injuries, or playoff elimination. Adjust multipliers as needed.

Build with the bundled spreadsheet artifact runtime:

```sh
FH_ARTIFACT_MODULE=/absolute/path/to/@oai/artifact-tool/dist/artifact_tool.mjs \
  /absolute/path/to/bundled/node scripts/build_management.mjs /absolute/output/directory
```

The existing Yahoo build must be present. `npm run build:yahoo` regenerates it
without deploying. The builder verifies the roster lookup, multiplier, weekly
forecast, goalie denominator, unknown-name handling, and missing versus zero
games. It clears all sample inputs before saving the deliverable.

Import `Fantasy-Team-Manager-2026.xlsx` as a new native Google Sheets spreadsheet.
The formulas work without Apps Script, so roster and schedule edits recalculate
automatically. Rebuilding creates a fresh template; never replace a populated
management spreadsheet merely to update projection data.
