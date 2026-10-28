# ChangeReceipt

A local-first prototype for reviewing a volunteer inventory handoff. Compare two CSV snapshots, choose the identifier columns and field mappings, inspect the differences, and download a comparison receipt with the source evidence included.

The useful boundary is deliberate: ChangeReceipt reports differences between supplied text records. It does not confirm a physical handoff, verify quantities, detect fraud, or automatically reconcile real inventory.

## Run locally

Requires **Node.js 22.14 or newer**. For a compiled release ZIP, extract the
entire folder and run `node server.mjs`, then open **http://127.0.0.1:4173/**.
Windows users can also double-click `Start-ChangeReceipt.cmd`. No npm install,
account, or external network connection is needed to run the compiled app.
Stop the server with Ctrl+C. If port 4173 is occupied, set `CHANGERECEIPT_PORT`
to another integer from 1024 through 65535. The server binds only to 127.0.0.1;
it serves the packaged `dist/` rather than live source files. Do not open the
HTML directly as a file: the synthetic examples need HTTP serving.

For a **source checkout** (including GitHub's automatic Source code archives),
npm installation and a build are required:

```sh
npm ci
npm run build
npm start
```

For development with live source updates:

```sh
npm ci
npm run dev
```

Open the localhost URL Vite prints. To check a production build locally:

```sh
npm run build
npm run preview
```

The app uses React, TypeScript, Vite, and Papa Parse. It needs no account, credentials, external API, backend, or paid service. Package installation needs access to the npm registry. Once the app is served locally, processing happens in the browser; the synthetic example is loaded from local bundled files.

## Use it

1. Import the before and after CSV snapshots, or load the synthetic example.
2. Choose an identifier column for each file. No identifier column is inferred. Identifiers compare exactly as text: `0001` stays distinct from `1`, and whitespace and letter case remain significant.
3. Add labeled field mappings. A field can map different column names across files. Review the comparison scope; columns omitted from the mapping are not compared.
4. Review added, removed, changed, unchanged, ambiguous, and invalid-key entries. Open the source evidence for the relevant records.
5. Download the full JSON receipt. Use the CSV export as a convenient view of results, with the JSON receipt as the authoritative evidence package.

Changing a source or mapping requires a new comparison. Reset clears the in-memory session. Reloading or closing the page also loses the session; download a receipt before leaving if you need to retain it.

## Evidence and ambiguity rules

- A nonempty identifier occurring more than once in either snapshot makes the entire identifier group ambiguous. The corresponding records on both sides remain together; none is silently counted as an added, removed, changed, or unchanged match.
- Empty or missing identifiers are unresolved records. They are never matched to one another.
- Field values compare as exact strings. A missing cell is `null`; a present empty cell is `""`. Numeric-looking cells are not converted, added, or subtracted.
- Short records are retained with missing cells and warnings. They, duplicate identifier groups, and invalid identifiers make a comparison incomplete.
- Unmapped columns remain in the preserved sources and are identified as outside the comparison scope.
- Record numbers count CSV records, with the header as record 1. A quoted newline does not create a new record.

The JSON receipt includes the source filenames, original bytes encoded as base64, SHA-256 fingerprints, decoded source text, parsed records, the chosen mapping, comparison rules, warnings, and all result entries. Comparison ordering is deterministic for the same inputs and mapping. Fingerprints identify the imported bytes; they do not establish who created a file or prove that a physical inventory is correct. A downloaded receipt is an editable file, not a signed or tamperproof audit record.

## Import limits and safety

Inputs must be UTF-8 CSV, using a comma delimiter and a header record. A UTF-8 byte-order mark is supported. Imports are bounded to 2 MiB per file, 10,000 data records, 64 columns, and 20,000 characters per cell. Invalid encoding, NUL bytes, malformed quoting, empty or duplicate headers, and records wider than the header reject the import with an error. Quoted commas, escaped quotes, and multiline cells are supported.

Untrusted cell text is rendered as text through React. Convenience CSV output quotes cells and protects spreadsheet formula-like values. The compact CSV change log is capped at 16 MiB; if an accepted input would expand beyond that, export stops with a clear message and directs you to the full JSON receipt. It does not truncate results. This protection changes the exported presentation of affected strings; use JSON to recover the exact source values. The app does not write into imported files.

The browser keeps imported data only in memory. There is no analytics, remote processing, application database, or persistent session storage. This prototype does not include encryption, authentication, collaboration, or a saved-receipt viewer. Handle downloaded files according to your own data practices.

## Check a saved receipt locally

The optional [self-consistency verifier](receipt-verifier/README.md) re-imports the
original CSV bytes in a saved receipt, checks their hashes, and recomputes the
comparison with the same core. It does not upload the file or overwrite it:

```sh
node --experimental-strip-types receipt-verifier/cli.mjs ./receipt.json
```

A pass means the evidence and comparison agree internally, **not** that the file
has a trusted author or represents real inventory. A person who rewrites all the
evidence consistently can produce a passing file. The CLI applies documented size
and compatibility limits and can reject unusually large otherwise valid exports.

## Fixtures and checks

All bundled examples are synthetic. The main handoff includes renamed columns, leading-zero IDs, quoted comma/newline cells, changed values, a new record, a removed record, a duplicate group, empty IDs, and a short record. See [fixture expectations](public/fixtures/README.md) for exact counts and smaller rejection/security cases.

```sh
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:browser
npm run test:server
```

The configured unit suite targets parsing, bounds, deterministic comparison, ambiguous identifiers, value preservation, and export behavior. The browser suite targets the usable workflow and accessible interaction. Set `CHANGERECEIPT_SERVER_MODE=production` after building to run the same browser suite through the dependency-free release launcher instead of Vite. CI checks both modes. Browser testing requires Playwright's browser runtime; use `npx playwright install chromium` if it is not installed. To use an installed Chrome instead, set `PLAYWRIGHT_CHANNEL=chrome` in your shell. A script being present is not itself evidence that it passed; the final local verification report records the checks actually run and any unavailable checks.

## Project status

This is an original local prototype for the Arbiter General Track candidate. Public source and free downloadable releases are separate from event registration and submission. This task does not register or submit an event entry. There are no sponsor API or prize-value claims in the product.

See the [verification report](docs/QA.md) and [independent review](docs/REVIEW.md) for checked evidence. The [demo outline](docs/DEMO.md) provides a concise walkthrough, and the [design notes](docs/DESIGN.md) explain the interface choices.
