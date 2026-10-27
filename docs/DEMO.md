# ChangeReceipt demo outline

Aim for roughly 2-3 minutes, with scene duration following a slightly slower conversational narration. The table is a rehearsal guide, not a fixed audio deadline. Use brief natural breathing room between ideas; shorten wording rather than mechanically stretching audio or creating long silences. Record the working local app with the synthetic fixtures only. Do not represent a local prototype as a published or submitted entry.

| Time      | Show                                                                                                                              | Explain                                                                                                                                                                                             |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:20 | Sources step and the two synthetic handoff files                                                                                  | A shift handoff can arrive as two spreadsheets with different headers. The job is to explain differences without throwing away the evidence or assuming repeated IDs are trustworthy matches.       |
| 0:20–0:55 | Import the example; explicitly choose Asset ID and Inventory ID; map Item→Description, Location→Storage, Count→Count, Notes→Notes | Keys and comparison scope are a human choice. Leading-zero IDs remain text. Unmapped columns remain preserved but are outside scope.                                                                |
| 0:55–1:35 | Review counts, open `0002` and `0003`, then open the `0006` ambiguity                                                             | Count is a text change from `2` to `3`; no physical quantity was measured. Duplicate `0006` records stay unresolved together, including the unique after record, instead of creating a false match. |
| 1:35–2:05 | Inspect empty identifiers and the missing Notes cell for `0008`; optionally demonstrate the malformed fixture rejecting           | Empty IDs do not match. Missing and empty data are different. The receipt says incomplete when the inputs contain unresolved evidence.                                                              |
| 2:05–2:30 | Export JSON and inspect its mapping, warnings, original-byte fingerprints, source records, and result entries                     | The deliverable explains the chosen rules and keeps the inputs with the result. A SHA-256 fingerprint identifies bytes; it does not certify the stocktake or the origin of a file.                  |
| 2:30–2:40 | Return to the local app; show reset and a fresh empty session                                                                     | The workflow is local, bounded, and useful today. It makes no automatic real-world reconciliation or fraud-detection claim.                                                                         |

## Rubric focus

| General Track weight    | Evidence in the demo                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Technical quality — 35% | Strict, bounded UTF-8 CSV parsing; exact text comparison; explicit mappings; duplicate-group exclusion; source preservation; safe rendering and CSV export; measured test evidence.     |
| Originality — 25%       | The comparison receipt treats ambiguity and scope as part of the output. The product serves the narrow volunteer handoff moment without hiding uncertainty behind a merged spreadsheet. |
| Completeness — 25%      | Import → map → inspect → export is a working end-to-end local workflow, including rejection, incomplete results, changes of mapping, and reset.                                         |
| Demo — 15%              | One synthetic story, readable UI, visible hard case, downloadable evidence. Keep the screen focused on the current action and avoid an architecture slideshow.                          |

The expected main fixture result, with all four fields mapped, is 1 added, 1 removed, 2 changed, 2 unchanged, 1 ambiguous identifier group, and 2 invalid-key records. It is incomplete because the sources contain unresolved identifiers and short records.

## Recording checklist

- Rehearse from a reset session using the final build.
- Keep the identifier choices and mappings visible long enough to read.
- Use the actual test report for any testing claims. Do not claim coverage or compatibility beyond what was run.
- Do not show private user data, browser accounts, credentials, or other projects.
- Publication, repository creation, uploads, agreement acceptance, and final submission remain separate owner-controlled actions.

## Visual production direction

Use a cohesive full-frame HyperFrames/GSAP foundation, narration-led timing, animated typography, and product visuals with one design language. Use a selective 3D or painted accent only when it improves explanation or personality. Keep the actual import, mapping, ambiguity review, and receipt export central; avoid disconnected cropped panels. Verify listening and audiovisual timing when a recording is produced. This outline is not a rendered or listened-to film.
