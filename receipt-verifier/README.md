# ChangeReceipt local self-consistency verifier

Independent local CLI for exported **ChangeReceipt v1** JSON. It imports the existing
`src/core/index.ts` parser, mapping validator, comparator, and receipt builder; it does
not fork their behavior. No server, network calls, credentials, publication, execution
of embedded values, or writes to the input file.

## Run

From the ChangeReceipt project root, with its dependencies installed (`npm ci`),
using Node 22.14+:

```sh
node --experimental-strip-types receipt-verifier/cli.mjs --help
node --experimental-strip-types receipt-verifier/cli.mjs ./receipt.json
node --experimental-strip-types --test receipt-verifier/verify.test.mjs
```

Use `./` before a filename beginning with `-`. Exit codes: **0** consistent (including
an incomplete comparison), **1** rejected/unsupported/inconsistent receipt, **2**
incorrect command usage, file access failure, or runtime failure. Errors print fixed
reason codes, never file contents, filenames, mapping labels, or parser error text.

## Checks and limits

- A regular file only, opened read-only/nonblocking. Size is checked before a bounded
  read (32 MiB maximum). A size change during the read is rejected when observable.
- Strict UTF-8 JSON; nesting at most 16. Exact version-1 object fields and expected
  primitive/array types. Unknown properties are rejected. Object key order is ignored;
  standard JSON.parse semantics apply to repeated object keys (last value wins).
- Core limits: each original CSV at most 2 MiB, 10,000 data rows, 64 columns, and
  20,000 characters per cell. Mapping at most 126 fields with labels at most 20,000
  characters; filename metadata at most 4,096 characters. Comparison references at
  most 20,000 rows in total. Warning arrays at most 128 entries. These compatibility
  bounds can reject an unusually large export that the browser itself could create;
  rejection does not establish fraud or tampering.
- Canonical padded base64, exact declared byte length, independent SHA-256 rehash.
- Re-import original bytes with the real parser; compare full snapshot, including
  BOM-preserved decoded text, headers, cells, record ordinals, and warnings.
- Validate chosen mapping through core; recompute comparison, entries, summary,
  completeness and warnings. Rebuild receipt to verify fixed rules/purpose/limits.

All schema and size checks precede hashing and CSV parsing. The CLI processes only
one file and emits a small result, not source data. It is not intended as an exposed
network service or a general-purpose hostile-input security boundary. The file is not
locked; keep it stable during verification. A successful result describes bytes read,
not a promise that the on-disk file will remain unchanged later.

## What success does NOT mean

**Self-consistency is not trusted authenticity.** There is no trusted external hash,
signature, issuer, or timestamp. Someone can change original bytes, recompute hashes,
parsed values, and comparison, and produce a receipt that passes. The tests expressly
prove this. Names and mapping choices are claims supplied by the receipt, not independently
verifiable provenance. This tool cannot establish who created a receipt, whether it
is the original export, or whether physical inventory is correct. It never calls a
receipt tamperproof. An incomplete comparison can still be internally consistent.

## Reproducible tests

The suite generates receipts using `createReceipt` and actual bundled synthetic CSVs;
no invented receipt schema or copied comparison implementation. It covers valid and
incomplete receipts, missing versus empty cells, source/type/version/size failures,
canonical base64 (including unused pad bits), hash and parsed-value mismatches,
stale comparison/mapping, altered metadata, safe CLI errors, input non-modification,
and a near-2-MiB source.

The original source and fixtures were verified against Git blob hashes
at commit `bbc582b98c66e0a81b0193c655f8434c5c2bfc14`. The standard handoff produces
1 added, 1 removed, 2 changed, 2 unchanged, 1 ambiguous group, and 2 invalid-key
records. Existing core unit tests are separate from this CLI suite.
