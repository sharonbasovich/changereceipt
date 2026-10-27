# Independent code and UX review

Review mode: full. Scope: the React/TypeScript application, plain CSS, CSV comparison and receipt core, synthetic fixtures, README, and demo outline. This review was performed separately from implementation. Source inspection and observed browser behavior are distinguished below.

## Coverage

| Area                     | Evidence inspected                                                                    | Result                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Correctness and safety   | src/core/index.ts, unit cases, fixtures, independent roundtrips                       | No actionable defect remains in strict CSV parsing, exact IDs, whole-group duplicate exclusion, source byte preservation, deterministic receipts, or formula protection. |
| Typography               | CSS, labels/values, scope and warnings, final screenshots                             | Coherent hierarchy, tabular totals, long-header wrapping and bounded option text.                                                                                        |
| Surfaces and interaction | Source/mapping/review code; four independent edge workflows; final review screenshots | Native controls, explicit keys, visible focus, and accessible primary hit areas. Depicted desktop/mobile controls are not clipped.                                       |
| Animation                | Entry, press, disclosure and loading CSS                                              | Specific transition properties and reduced-motion override. Slow-motion playback not independently observed.                                                             |
| Icons                    | Lucide imports, brand/receipt treatment, screenshots                                  | Consistent outline family and currentColor, supporting readable labels.                                                                                                  |
| Performance              | Entry/source pagination, option text, CSV export                                      | Previously unbounded rendering/export paths resolved and regression checked.                                                                                             |
| Claims                   | README, receipt rules, review copy, demo                                              | No claim of verified stock, measured quantity totals, fraud detection, signed provenance, publication or submission.                                                     |

## Findings and resolution

Severity describes the original finding. All findings below have been resolved.

| Severity | Location                                                     | Before                                                                                                                                                                                          | After                                                                                                                                                                                                                  | Why                                                                                                                           |
| -------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| HIGH     | src/components/ReviewStep.tsx:24 and :89, SourceRows / Entry | Closed entries mounted every source row. One valid 10,000-row × 64-column duplicate group could mount about 1.28 million cells across two sources.                                              | Native-open lazy mounting and 20-record pages per side. Actual maximum row/column inputs passed pagination and full JSON retention checks.                                                                             | Entry pagination alone does not bound records inside a duplicate group.                                                       |
| HIGH     | src/core/index.ts:483, receiptCsv                            | Full source-row JSON repeated for each changed field. A 100-row × 64-column case expanded 26,890 input bytes into 5,692,848 CSV characters; a 10,000-row projection exceeded V8's string limit. | Compact deltas with source record references and an incremental 16 MiB UTF-8 ceiling. The same small case now produces 401,567 characters. Oversized CSV yields an accessible error while JSON still downloads intact. | Bounded imports must not produce unbounded exports. Long IDs/labels also require a ceiling. No values are silently truncated. |
| HIGH     | src/components/MappingStep.tsx:18, ColumnSelect              | Maximum-length source headers repeated in every option of up to 128 selects, permitting about 160 MB of option text.                                                                            | Long display names shortened with column ordinals; no full-header attribute copies. Verified 64 maximum-length headers and 128 selects with bounded text; full original header remains the receipt label.              | A bounded file should not amplify into a huge mapping DOM.                                                                    |
| MEDIUM   | Review scope/warnings and CSS                                | Accepted long unbroken headers could widen the document.                                                                                                                                        | Anywhere wrapping. A 390 px viewport with a 20,000-character ID header and expanded long warnings stayed within the viewport.                                                                                          | Evidence must remain usable on mobile.                                                                                        |
| MEDIUM   | Review incomplete-result banner                              | Copy implied missing-cell rows were excluded from ordinary counts, although unique-ID rows can be unchanged and still incomplete.                                                               | Copy distinguishes unresolved IDs outside normal counts from explicit missing cells and incompleteness.                                                                                                                | Wording now matches the rules.                                                                                                |
| MEDIUM   | SourceEvidence / src/download.ts                             | Raw-original download controls could emit unescaped CSV formula text.                                                                                                                           | Raw CSV controls and unused decoder removed. Exact bytes, text, rows and hashes remain in JSON; the convenience CSV is protected.                                                                                      | Meets the requirement for every CSV output without discarding evidence.                                                       |
| MEDIUM   | Expanded result/source disclosures                           | Broader axe checks found heading-level, contrast and repeated region-name issues.                                                                                                               | Source heading hierarchy corrected, evidence text darkened, and region names distinguish side, context and starting record. The owner's expanded-disclosure suite verifies these states.                               | Evidence disclosures must be accessible as well as the collapsed screen.                                                      |
| LOW      | src/App.tsx, workspace notice                                | Import notice instructed ID selection after review was reached.                                                                                                                                 | Notice limited to the sources stage, confirmed in code and screenshots.                                                                                                                                                | Status should describe the current action.                                                                                    |
| LOW      | playwright.config.ts / README                                | Runner selected Chrome while setup instructed installing Chromium.                                                                                                                              | Chromium default; installed Chrome explicitly selectable with PLAYWRIGHT_CHANNEL=chrome.                                                                                                                               | Setup matches execution.                                                                                                      |

No actionable code or interface-polish finding remains within the inspected scope.

## Independent experiments

The retained parser harness was run with:

    node --experimental-strip-types scripts/review-csv-roundtrip.mjs

Exit 0: PASS, 2,500 deterministic synthetic CSV roundtrip cases (seed 17). It covers 1–5 columns, 0–6 data rows, short records, and quoted empty/comma/quote/CR/LF/tab/Unicode fields, checking parsed cells and exact decoded source text. Targeted mixed record separators, quoted CRLF, doubled quotes, malformed closing quotes and interior blank records also passed. Node's experimental type-stripping warning was expected.

The retained browser regression was run with:

    node scripts/review-bounded-ui.mjs

Exit 0 using installed headless Chrome against localhost. This Windows environment required sandbox escalation for localhost access. All four checks passed:

1. Two valid 10,000-record × 64-column sources with one duplicate group. Closed evidence mounts zero rows; opening mounts 20 per side; the next page starts at CSV record 22. JSON retains all 20,000 source records and exact text.
2. A 390 px viewport with a 20,000-character ID header and expanded long unmapped-header warnings remains within viewport width.
3. Valid 8,000-character Unicode IDs force the 16 MiB CSV ceiling. An accessible error directs the user to JSON; full JSON downloads with all 30 changed records. No page errors.
4. All 64 headers at the accepted 20,000-character maximum produce 128 mapping selects with bounded option text. The full original header remains the receipt label. No page errors.

Task-owned headless browsers closed in finally. No pre-existing user browser tabs were involved. Formatting and ESLint were also run on the retained review scripts.

## Visual evidence and later changes

The final [desktop review](../tests/evidence/desktop-review.png) and [mobile review](../tests/evidence/mobile-review.png) screenshots were inspected with view_image. Their normal review state has clear hierarchy, a visible primary export, readable labels and no clipped controls or page overflow. Screenshots alone do not verify interactions or every state.

Raw-original download controls were removed, and heading/region names and evidence colors were corrected after the four independent runtime checks. Source inspection confirms these changes preserve the tested comparison, JSON evidence, bounded options and pagination. The review script selects buttons/record ordinals rather than the changed region names; the owner's final workflow and expanded-disclosure tests check the final semantics.

## Considered and rejected

| Location     | Candidate                                        | Reason rejected                                                                                                          |
| ------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Completeness | Reject every explicit absent-side column mapping | This is an explicit scope choice, distinct from empty values. Short source records still make inputs incomplete.         |
| Summary      | Add quantity totals                              | Values are exact text without a physical measurement or unit model. Totals add unsupported interpretation.               |
| Evidence     | Call hashes tamperproof provenance               | The receipt is editable and unsigned. Hashes identify bytes without authenticating their origin; copy states that limit. |

## Final suite confirmation

The implementation owner and browser reviewer confirmed the final frozen-code browser suite passed 18/18 tests, exit 0, with no retries. It includes expanded result categories, comparison scope and both source previews with zero axe violations, plus the primary source/mapping/review keyboard and accessibility checks. The heading, contrast, region-name and raw-CSV-control changes are included in that final run. The browser reviewer closed its task-owned contexts and isolated test server.

## Final verdict

Approve within the inspected scope. Independent runtime verification used installed Chrome. Manual screen-reader output, 10% speed motion playback and non-Chromium engines were not independently verified. The owner's separate workflow/accessibility report records its own checks. No owner action is required for a useful tested local prototype.
