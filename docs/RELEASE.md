# ChangeReceipt 0.1.0

The first public source and free downloadable local prototype is published separately from any event registration or submission. The repository is [sharonbasovich/changereceipt](https://github.com/sharonbasovich/changereceipt).

The application compares two supplied inventory CSV files with explicit identifier and field mappings. It preserves exact source bytes in the JSON receipt, keeps duplicate-ID groups ambiguous, distinguishes empty from missing cells, and exports a compact spreadsheet-protected CSV change log. It does not verify physical stock, explain why a difference occurred, or detect fraud.

The reviewed build passed 35 unit tests and 18 browser workflows on October 26, 2026. Independent checks covered 2,500 generated CSV round trips and four browser boundary cases. The October 27 release preparation changes formatting, distribution metadata, notices, and the demo outline; application behavior remains the reviewed checkpoint. The formatting check passes.

The curated source and built bundle were scanned with official Gitleaks 8.30.1, whose downloaded archive was checked against its published SHA-256 checksum. The scan reported no leaks. A separate publication-file review found no private contact details or personal filesystem paths. These checks reduce publication risk; they are not a guarantee against every possible secret.

The release package includes source, locked dependency versions, fixtures, tests, documentation, example receipts, runtime dependency notices, and the built `dist` application. `node_modules`, local caches, browser profiles, and private machine configuration are excluded. The original local checkpoint archive is retained separately.

See [QA](QA.md) and the [independent review](REVIEW.md) for the checks actually performed and their limits. Chrome was tested; physical mobile devices, other browser engines, and manual screen-reader output remain unverified. Files are held in tab memory; there is no saved-session or receipt-viewer feature. CSV logs stop at 16 MiB with a full-JSON fallback.
