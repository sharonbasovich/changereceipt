# Static synthetic demo preparation

This is a separate static build for `/changereceipt/`. It removes the Node/ZIP setup requirement for someone viewing the eventual hosted demo. It does not deploy anything, enable Pages, change a released ZIP or local launcher, or edit the existing Arbiter entry.

## Build and verify

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run build:hosted
npm run test:hosted
```

`npm run build` still writes the standard local app to `dist/`. `build:hosted` writes only `dist-hosted/`; it fingerprints an existing local `dist/` before and after and fails if any byte changes. No dependency was added. The hosted build uses Vite's explicit `/changereceipt/` base; the existing fixture loader already resolves `import.meta.env.BASE_URL`.

The artifact root contains `index.html`, `assets/`, `fixtures/`, third-party notices, `.nojekyll` and `BUILD-MANIFEST.json`. The manifest lists SHA-256 file fingerprints, its source commit and whether the source was dirty; it excludes itself from its own fingerprint list, including on repeated builds. Distribute a build from the final clean commit, with `sourceDirty: false`; these identifiers describe the build and are not a signature or trusted-origin guarantee.

For a strict local production preview:

```sh
npm run preview:hosted
```

Open `http://127.0.0.1:4186/changereceipt/`. This preview maps that URL prefix to the artifact root and deliberately returns 404 at `/`, for missing files, and for source paths. It accepts only GET/HEAD. `CHANGERECEIPT_HOSTED_PORT` can select another port from 1024–65535. Stop with Ctrl+C. This helper is a local QA tool; it is not a required hosted backend.

The hosted Playwright configuration runs all existing browser workflows plus hosted-specific cases against this actual production build. It does not use Vite's development server or a root-page fallback. Set `PLAYWRIGHT_CHANNEL=chrome` to use an existing Chrome, or use the already configured Playwright Chromium runtime. Hosted screenshots have their own evidence directory, preserving existing local screenshots.

## Visitor and privacy boundary

The hosted first screen identifies itself as a synthetic demo, offers the bundled example before file inputs, and explains hosting metadata before file selection. IDs and mappings remain explicit. Source CSV contents, filenames, mappings, comparisons and downloaded receipts are not sent to an application server. The app adds no accounts, analytics, remote API, service worker or persistent session storage. Reset and reload discard its in-memory workspace; downloaded files remain where the visitor saves them.

The host necessarily receives page and static asset requests, including synthetic fixture requests. Its normal request metadata may include IP address, browser details, time, path and referrer, and the provider may keep access logs. This application does not control the provider's logging, browser/extension behavior or downloaded-file handling. “CSV contents stay in this tab” is not a claim that viewing a hosted page makes no network requests.

Only synthetic fixtures are bundled and used in QA. Uploaded CSVs still use the released bounded parser and exact-text comparison. Duplicate-ID groups stay unresolved; leading zeroes, missing versus empty cells, formula protection, source bytes, warnings and all physical-inventory limitations are unchanged. The localhost-only release remains available from the notice for visitors who prefer it.

## Remaining deployment steps after review

1. Review the isolated branch/draft and the hosted verification report. No review request, formal approval, Ready transition or merge is performed by this stage.
2. Choose an already-authorized static HTTPS host and mount the **contents** of `dist-hosted/` at `/changereceipt/`. For a GitHub project site whose URL is already `/changereceipt/`, deploy the artifact root directly. Do not add another `changereceipt` directory. For an origin-root site, mount/unpack this payload into that site's `/changereceipt/` directory instead.
3. Keep the existing site/entry untouched until the exact live URL is verified. Use correct JS/CSS/CSV MIME types, HTTPS (required by browser crypto), and fresh HTML on updates; do not add analytics, account access or an upload endpoint.
4. At the real HTTPS URL, load the synthetic pair, explicitly map columns, compare, open evidence and download the receipt. Confirm assets and fixtures stay under `/changereceipt/` and the JSON matches expected fixture results. Localhost tests do not verify a third-party host's configuration or access-log policy.
5. Only after that review and any applicable publication gate should the parent decide whether to update links. Enabling Pages, merging and editing Devpost are outside this implementation stage.

The standard release and all earlier releases remain the rollback. The static payload can be removed or reverted independently of the local app.
