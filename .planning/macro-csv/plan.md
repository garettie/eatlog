# Macro CSV interchange

Status: implemented locally; phone acceptance and native runtime verification pending.

## Behavior

- Keep `.eatlog-backup` and legacy archive restoration separate from CSV transfer.
- Export one Macro-schema CSV with current profile/target metadata, meals, components, and weights.
- Import history with Merge as default or confirmed Replace history. Both preserve the profile and target history.
- Preview dates, timezone, duplicates, conflicting weights, and ingredient fallbacks before mutation.
- Recognize whole-number source rounding. Preserve recorded nutrition totals; retain validated original detail for unchanged re-export when ingredients disagree.
- Retain counts and units when mass is unknown. Editors, search, reuse, and logging keep physical grams and gram densities null.
- Store stable source identities in schema version 11. Capture a safety database before an exclusive import transaction; verify integrity before commit.
- Refuse replacement if local history changed after inspection. Replace clears derived reviews and completeness confirmations, pauses Health Connect, and removes detached photos after commit.

## Verification

- Synthetic parser, exporter, SQLite migration/import, rollback, stale-preview, and counted-portion tests.
- Private source-file import/export/reimport check. Keep source records, analysis scripts, and generated personal exports outside tracked files.
- Repository checks in CONTRIBUTING.md and Android JavaScript bundle compilation.
- Phone acceptance: import an exported CSV into Macro, verify dates, totals, ingredient quantities, weights, and metric metadata; then export from Macro and inspect it in Eatlog Preview.

## Compatibility limits

CSV is a history-transfer format. Photos, complete target history, adaptive reviews, purchases, credentials, and consent choices remain outside CSV. Full device recovery uses the Eatlog archive. Metadata mappings follow the supplied Macro schema; actual Macro acceptance requires the phone test.
