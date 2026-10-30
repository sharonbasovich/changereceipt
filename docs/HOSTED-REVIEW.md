# Hosted demo verification

Reviewed 2026-10-30, from public main `ea098e4837eb7c7c3c2365e844900a21aaa7aef4` in an isolated checkout. This change prepares a separate static `/changereceipt/` payload. It does not deploy a site, alter existing releases, change the local launcher, or edit the submitted entry.

## Completed checks

| Check                                        | Result                                                |
| -------------------------------------------- | ----------------------------------------------------- |
| ESLint, TypeScript, Prettier                 | Passed                                                |
| Standard production build                    | Passed                                                |
| Separate hosted production build             | Passed; existing local `dist/` fingerprints unchanged |
| Vitest                                       | 187 passed                                            |
| Receipt verifier Node tests                  | 44 passed                                             |
| Local static server Node tests               | 2 passed                                              |
| Existing development browser workflows       | 20 passed, Chrome                                     |
| Existing local production launcher workflows | 20 passed, Chrome                                     |
| Actual hosted production subpath workflows   | 27 passed; 0 skipped, failed or flaky, Chrome         |

The hosted report's final reviewed interaction run started at `2026-10-30T23:31:00Z`. It uses the compiled artifact through a strict localhost static server at `/changereceipt/`, not a development server. The 27 cases include the 20 existing workflows and seven hosted cases. CI now runs the separate build and suite as well; a remote CI result is not implied by these local results.

The real synthetic workflow loads the bundled CSV bytes, leaves both key selectors unselected, explicitly maps columns, compares, inspects source evidence and downloads JSON and CSV. Assertions verify preserved bytes/base64/SHA-256, leading-zero keys, exact field mappings and the expected record counts: two changed, one added, one removed, two unchanged, one ambiguous group and two invalid records. The duplicate `0006` group retains two before records and one after record without inventing a match.

Additional cases cover malformed and canceled replacement, stale and late reads, repeated imports, changed mappings, reset/reload, unavailable fixtures and recovery, keyboard activation/focus, 390-pixel mobile layout, reduced motion, accessibility checks, and safe rendering of cell text. A sentinel CSV, filename and cell marker are absent from observed request paths, headers and bodies. Only same-origin static GET requests occur; the suite also checks storage and WebSocket absence. These observations and source review support the application's data boundary; they do not certify arbitrary browsers, extensions or hosting infrastructure.

## Review and corrections

An independent reviewer inspected the source changes, static preview, build/test configuration and all four rendered screenshots. The initial review identified misleading provenance for a dirty source tree and screenshot scroll/focus artifacts. The build now records `sourceDirty`, and captures normalize scroll and focus. The follow-up found no remaining actionable P0/P1/P2 issues. That review was read-only and did not independently rerun browser interactions. The implementation author ran the interaction suites and inspected the rendered desktop and mobile start screens.

The hosted first screen puts the synthetic example and hosting-metadata disclosure before file selection. The mobile example button fits within the tested 390×844 initial viewport. Existing native controls, explicit mapping and evidence hierarchy remain intact. Rendered evidence is in [the hosted screenshot directory](evidence/hosted/).

A bounded Kiro review was attempted once with sanitized input; its stream exceeded the response cap and produced no usable review. It is not counted as a successful review and was not retried.

Two existing tests required Windows portability corrections: the verifier CLI now receives a native path via `fileURLToPath`, and the local server's escape test uses a synthetic directory junction on Windows where file symlinks require unavailable privileges. Neither change alters runtime behavior or machine settings. An initial browser run exhausted disk space while writing downloads/traces; only this task's npm cache was removed, and the complete suites subsequently passed.

## Packaging and limits

The final payload is rebuilt from the clean isolated branch commit; `BUILD-MANIFEST.json` must identify that commit with `sourceDirty: false`. Delivery includes ZIP SHA-256 and extraction verification against every manifest file. These hashes identify bytes, not authorship or physical stock accuracy. No new application dependency was added. Core parser/comparison, source preservation, local server runtime, launcher and lockfile remain unchanged.

The staged source snapshot and compiled static payload were scanned with Gitleaks 8.30.1, with no findings. The scanner archive was checked against its existing upstream checksum file. This is an automated scan, not proof that all possible sensitive information can be recognized.

No third-party HTTPS host, remote access-log policy, other browser engine, physical mobile device or manual screen-reader session was validated. Browser accessibility automation and reduced-motion checks have the scope described above. Ordinary hosting request metadata remains visible to the provider; imported CSV contents remain in application memory until reset/reload, and downloaded receipts remain with the visitor. The app does not verify physical inventory, infer fraud or measure quantities.

See [HOSTED-DEMO.md](HOSTED-DEMO.md) for the exact deployment handoff. Deployment, merge and submission changes are outside this stage.
