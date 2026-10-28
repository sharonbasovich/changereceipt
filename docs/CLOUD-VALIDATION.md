# Local candidate validation

Base: public commit `bbc582b98c66e0a81b0193c655f8434c5c2bfc14`.
All 43 materialized text files were verified against their Git blob hashes before changes.
Validation snapshot for the source-review branch. No deployment or event submission is included.

## Changes

- Preserve a literal U+FEFF in the first CSV header after removing the single encoding
  BOM. Papa Parse otherwise removes a second BOM. A focused regression fails on the
  original source and passes after the three-line importer adjustment.
- Load bundled demo CSVs using Vite's configured base URL instead of an origin-root
  path. Tests cover root, nested and relative bases, exact bytes, failure and aborts.
- Add a bounded, read-only receipt self-consistency CLI. It reuses the application
  parser and comparator and checks embedded bytes, hashes, parsed fields, mapping,
  result and metadata. This is not provenance authentication or a tamperproof seal.
- Add deterministic parser/comparison invariants and adversarial verifier cases.
- Restore keyboard focus after removing a source or mapping row, with eight real
  React DOM/jsdom regressions covering repeated and final-row removals. Focus tests
  were checked red on the original implementation and green on the fix.

## Verification

- `npm test`: 180 Vitest cases plus 44 Node receipt-verifier cases passed.
- `npm run lint`, `npm run typecheck`, `npm run build`: passed.
- `node --experimental-strip-types scripts/review-csv-roundtrip.mjs`: 2,500 seeded
  synthetic CSV roundtrips passed.
- Independent review ran 38 additional adversarial assertions without a blocking
  finding. Reviewed code and tests, not only pass counts.
- Patch application was checked against the exact text-file baseline.

Node used for these runs: 24.22.1. Minimum supported Node execution was not tested.
Runtime dependencies are unchanged.

## Limits and compatibility

Local browser execution was unavailable because Chromium could not create its
required socket. The first PR CI run executed all 18 existing Chromium checks:
17 passed and one reported insufficient contrast in the mapping ID explanation
(4.38:1 against a 4.5:1 threshold). This branch darkens only that explanation text;
the existing axe assertion is retained unchanged. See PR checks for the rerun result.
Screen-reader and manual visual checks are not claimed.

CI uses a standard public Ubuntu 24.04 runner, read-only contents permission,
Node 24, and the official Playwright Chromium installation. It does not deploy.

Old receipts affected by the double-BOM parser defect can fail re-import consistency
under the corrected parser. The original bytes were retained; the rejection identifies
inconsistent parsed evidence, not fraud. The CLI's documented compatibility and size
bounds can also reject unusually large otherwise-valid browser exports.

The configured-base fix is covered by unit tests and production compilation, not an
end-to-end hosted or subpath browser test. Do not publish this report as a claim of
full browser certification.
