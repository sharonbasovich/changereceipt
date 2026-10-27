# Local verification

Verified on October 26, 2026 using synthetic inventory data only. The application runs locally; nothing was registered, published, uploaded, or submitted during this build.

## Results

| Check                       | Result                                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESLint                      | Passed                                                                                                                                               |
| TypeScript project checks   | Passed                                                                                                                                               |
| Vitest core suite           | 35 of 35 passed                                                                                                                                      |
| Vite production build       | Passed                                                                                                                                               |
| Playwright browser suite    | 18 of 18 passed, no retries, approximately 1.5 minutes                                                                                               |
| Independent CSV round trips | 2,500 deterministic generated cases passed                                                                                                           |
| Independent boundary checks | Four browser checks passed: maximum duplicate group, long-header mobile scope, CSV ceiling with JSON fallback, and bounded long-header mapping menus |

The browser suite covers explicit IDs and cross-name mappings, duplicate exclusion, missing versus empty values, exact original bytes and SHA-256, deterministic exports, malformed quotes/headers/UTF-8/width/size, repeated imports, changed mappings, cancellation and reset, pending-example races, safe rendering, protected CSV output, filtering/pagination, keyboard interaction, mobile layout, reduced motion, and axe checks across primary and expanded evidence states.

The maximum-input experiment imported 10,000 records and 64 columns in each source, with every record sharing one ID. Closed evidence mounted no source rows; open evidence displayed 20 records per side with working pagination. The full receipt retained all 20,000 records and both original sources. These are observed cases, not a general performance benchmark.

The CSV log uses compact deltas and source record references. Incremental UTF-8 accounting stops exports above 16 MiB with an actionable message. The independent browser check confirmed that the full JSON receipt remains available after that error. There is no silent truncation. Exact source bytes are preserved inside JSON rather than offered as an unprotected CSV download.

## Reproduce

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm run format:check
node --experimental-strip-types scripts/review-csv-roundtrip.mjs
```

The independent boundary script expects a running local server:

```sh
npm run dev
node scripts/review-bounded-ui.mjs
```

That boundary script uses installed Google Chrome. The main Playwright configuration defaults to its bundled Chromium; set `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome instead. `CHANGERECEIPT_PORT` selects a validated local test port. The final Windows run used Chrome and an isolated port, with server and browser outside the restricted network namespace because the sandbox prevented their localhost connection.

## Visual evidence and limits

- [Full synthetic JSON receipt](evidence/synthetic-receipt.json)
- [Protected synthetic CSV change log](evidence/synthetic-change-log.csv)
- [Sources, desktop](evidence/sources-desktop.png)
- [Mapping, desktop](evidence/mapping-desktop.png)
- [Review, desktop](evidence/review-desktop.png)
- [Review, mobile](evidence/review-mobile.png)
- [Independent review and resolved findings](REVIEW.md)

Desktop captures use 1440 by 1000 and the mobile viewport uses 390 by 844. The final screenshots were inspected for hierarchy, wrapping, control visibility, and clipping. The selected design is an original ledger workspace using system fonts, restrained CSS transitions, and reduced-motion support.

The in-app browser bridge timed out, so browser verification used Playwright with installed Chrome. Safari, Firefox, physical mobile hardware, and manual screen-reader output were not verified. Automated axe checks and keyboard tests are useful evidence, not accessibility certification. No real volunteer data or physical stocktake was tested. The receipt is editable and unsigned, and the app does not include persisted sessions or a saved-receipt viewer.
