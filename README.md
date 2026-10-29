# Syrka Workspace

A Next.js App Router / TypeScript workspace MVP with a responsive dashboard, Tiptap-powered Syrka Write, Univer-powered Syrka Tables, React-based Syrka Present, and eight public Syrka Tools utilities. UI uses Tailwind CSS and a shadcn/ui Button built on Radix Slot.

## Run locally

Requires Node.js 22+ and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. On the sign-in screen, choose **Try demo — no account needed** to open a browser-local workspace preloaded with Write, Tables, and Present sample files. Demo entry is remembered for the current tab across reloads; **Exit demo** returns to sign-in. Demo files stay in this browser and are separate from authenticated cloud files. Missing, invalid, or wrong-project Supabase configuration shows an authentication error; it never silently enters demo. The **explicitly chosen local demo** stores files and embedded images in this browser's localStorage. Demo data does not upload or migrate automatically. Browser storage limits apply; a quota error is displayed as a save failure.

## Supabase setup

1. Create or select your own Supabase project. In SQL Editor, run `supabase/migrations/20261027010000_office_files.sql` once. Alternatively link the Supabase CLI to your project and run `supabase db push`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. Use the project URL and **publishable** key from the Supabase dashboard. Never use a service-role/secret key here.
3. Enable Email/password Auth. Set Auth Site URL to the deployed origin and allow `http://localhost:3000` plus your exact Vercel origins as redirect URLs. Sign up, confirm the email, then sign in.
4. Ensure `public` is an exposed Data API schema. The migration explicitly grants table access to `authenticated`; RLS limits every operation to the authenticated owner's UUID.
5. Verify with two separate accounts: create a file and upload an image as A; B must not see A's files, fetch/update/delete A's UUID, or sign/download A's asset path. Anonymous requests must fail. Run Supabase Security Advisor after applying the migration.

Authentication is client-side Supabase Auth. No private data is rendered on the server. All database/storage requests go through Supabase with the user's JWT and RLS. Private image objects use immutable user-prefixed paths, random names, a 5 MB limit, MIME allowlist and one-hour signed URLs. Reopening an editor refreshes image URLs. File JSON retains storage paths rather than signed credentials. User uploads are never served as executable SVG/HTML.

## Features

- Search, recent sorting, starred view, create, rename, duplicate, delete, grid/list views and optional sample files.
- Write: headings, bold/italic/underline/strike, lists, alignment, tables with row/column insertion, links, image upload, undo/redo, print/PDF through the browser.
- Tables: Univer cell editing, formulas, formatting, multiple worksheets, undo/redo. CSV import creates a new worksheet (2 MB, 10,000 rows, 256 columns); export downloads active-sheet values with spreadsheet-formula injection escaping.
- Present: 16:9 canvas, thumbnails, add/duplicate/delete/reorder, editable text, rectangular shapes, images, drag handles, numeric positioning/resizing, font size, colors, themes, keyboard presenter controls, and PPTX export with editable text/shapes and embedded images.
- 750 ms debounced autosave with serialized writes, save status, retry on error, navigation flush and browser unload warning for unsaved edits.

## Deploy on Vercel

1. Push this directory to a Git repository and import it into Vercel. Choose **Next.js**, Node.js 22+, root directory containing this package.json. Use `npm ci` and `npm run build` (already configured for webpack).
2. Add both Supabase variables to Preview/Production **before building**, then deploy. Public env values are compiled into the browser bundle; redeploy after changes.
3. Configure the exact deployed origin in Supabase Auth as described above.
4. Test signup/confirmation/signin, all three editors after reload, image upload, and cross-account isolation. Export CSV/PPTX and open the downloads in the intended target application.

No Docker, WebSocket service, office server, service role credential, or persistent Vercel filesystem is required. The connected Supabase project has the workspace migration applied. The Vercel project is linked to GitHub `tahirmahm/syrka-workspace`, with production branch `main`. Production deploys automatically from GitHub; do not deploy independently through the CLI/API. Supabase public configuration is configured for Production, Preview, and Development. Deployment settings are in `vercel.json`.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The E2E suite runs browser-local demo flows against the configured production build, including entry from the live sign-in screen. Chromium is configurable through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`; otherwise install it using `npx playwright install chromium`. Supabase live auth/storage and RLS require your configured project; unit/browser demo tests do not establish that live policies were applied.

## MVP boundaries

No real-time multiplayer, sharing, version history, comments, password reset UI, or DOCX/XLSX/PPTX import. Microsoft Office format compatibility is not claimed. CSV is a single-sheet interchange format; formatting and formulas are not retained on export. PPTX export supports the modeled text/rectangles/images and can differ in font metrics and wrapping. Present uses plain text, numeric resizing and rectangular shapes; no animation, charts or complex grouped objects. Write image signed URLs refresh on reopen; reopen after an hour if an image expires. Deleting a file does not delete its assets because duplicated files can reference the same image; unused asset cleanup is a future maintenance task. Concurrent tabs use last-write-wins; v1 is intended for one editor per file at a time. Files are downloaded in full; large workbooks and huge file collections are outside this MVP's performance scope.

## Product naming and compatibility

The suite is **Syrka Workspace**. Its product names are **Syrka Write**, **Syrka Tables**, **Syrka Present**, and **Syrka Create** (creative and design tools). Within Workspace, labels use Write, Tables, Present, and Create. Create is reserved in the product catalog; this MVP has no creative editor, so it has no launcher.

This branding update preserves persisted `doc`, `sheet`, and `slides` kinds, the `syrka-office-v1` browser storage key, `office_files` database table, `office-assets` private bucket, editor JSON models and file formats. The original `/` entry point remains unchanged; Tools adds `/tools` and `/tools/[slug]`. No existing URLs were removed. Existing user file names and content are never rewritten for branding. Internal editor filenames remain stable.

## Brand and device downloads

The interface combines Syrka’s monochrome symbol and wordmark with the original soft blue, sage, and peach palette and warm background undertones, while retaining the original layout. Existing document formatting and presentation colors are unchanged.

Every file card has a **Download** menu, and each editor has a **File → Download as** menu with standard formats listed below. Every file can also download a versioned `.syrka.json` backup with embedded images. Tables backups preserve all worksheets, cell formulas and formatting; active-sheet CSV remains available in the Tables toolbar. Backups are downloadable JSON; importing backups is not yet implemented. HTML opens in a browser and can be printed to PDF. These downloads do not claim full Office format compatibility.

## Syrka Tools — Phase 1

Visit `/tools` without logging in, or use **Tools** directly beneath Present in the sidebar. The catalogue supports instant search and PDF, Images, and Everyday filters. Each tool has a dedicated, statically generated page and an original 24×24 SVG pictogram.

| Tool | Local workflow |
| --- | --- |
| Merge PDF | Multiple PDFs, drag/keyboard reorder, remove, merge, preview and download |
| Split PDF | Page count, validated selections such as `1-3, 5`, extract and download |
| Images to PDF | JPG/PNG, previews/reorder, A4/Letter/Fit, orientation, PDF download |
| PDF to Images | Page selection, 72/108/144/216 DPI, PNG previews and individual/ZIP downloads |
| Compress Image | JPG/PNG/WebP input, quality and optional max dimensions, actual before/after sizes |
| Convert Image | JPG/PNG/WebP input/output, transparency retained in PNG/WebP, white fill in JPEG |
| Word Counter | Live words, Unicode characters, characters without whitespace, sentences, blank-line paragraphs, estimated reading time, copy/clear |
| QR Code Generator | Validated URLs or text, size options, four-module quiet zone, scannable PNG/SVG |

Tools never upload files or store file contents in localStorage, Supabase, or a server. State and temporary URLs exist only while using the utility; object URLs and canvases are released when reset, replaced or unmounted. There are no file-count/size quotas or subscriptions. Practical memory limits depend on the browser; processing yields between pages and PDF.js uses a local worker. Large files can exhaust browser memory—try fewer pages, a lower rendering resolution or a desktop browser. Password-protected PDFs must be unlocked first. Compressing an already optimized image can produce a larger file; the UI reports this accurately rather than claiming a reduction. PNG compression outputs WebP so quality is adjustable and transparency is retained.

`postinstall`, `predev`, and `prebuild` copy the installed, pinned PDF.js worker into `public/pdf.worker.min.mjs`. It is generated, ignored by Git/lint and rebuilt by `npm ci` on Vercel. The worker is served from the same origin; no CDN or extra backend is needed.

## Universal exports

All formats below are real encodings generated locally and available in demo mode. Exports use the latest editor model, never mutate it, use the current filename, and show progress/errors. Dashboard cards expose the same options.

| Application | Implemented formats |
| --- | --- |
| Write | **DOCX, PDF, TXT, HTML, MD** and portable `.syrka.json` backup |
| Tables | **XLSX, CSV, TSV, JSON, PDF** and portable `.syrka.json` backup |
| Present | **PPTX, PDF, PNG, JPG** and portable `.syrka.json` backup |

DOCX contains editable headings, styled text, lists, tables, links and embedded raster images. HTML and Markdown include embedded image data; Markdown tables use GFM syntax. TXT retains textual content without styling. PDF preserves supported rich text and tables, with embedded Roboto fonts covering Latin, Greek and Cyrillic; scripts outside that font's coverage may need the existing browser print workflow with a suitable system font. Merged-table layout and typography can differ between formats. Markdown rendering of embedded image data depends on the receiving application.

XLSX includes all worksheets, values, direct/shared formulas, common cell font/fill/alignment/number formats, dimensions and merged ranges. Excel recalculates formulas on open; functions unsupported by a destination application can differ. CSV/TSV export **values from the explicitly selected worksheet**, retaining quotes, delimiters and line breaks; values that could execute as spreadsheet formulas are prefixed with an apostrophe. No styles/formulas or additional worksheets can be represented in these text formats. JSON retains the full Univer model. Spreadsheet PDF prints values from the selected sheet, automatically paginating wide sheets in bands of ten columns; it is not a full Excel print-layout engine. Extremely sparse text/PDF used ranges exceeding two million cells are rejected to avoid unnecessary browser memory allocation; XLSX/JSON remain available.

PPTX keeps text, rectangles and images editable. Present supports all slides or validated ranges (`1-3, 5`); PNG/JPG use one file for a single slide or a ZIP for multiple slides. PDF and image exports render the 16:9 canvas at 2× resolution and are static snapshots; PPTX stays editable. Font wrapping can differ from the browser canvas and destination application.

**Unavailable and omitted from menus:** DOC, ODT, RTF, XLS, ODS, PPT and ODP. No file extensions are relabeled as a substitute for conversion. Full Microsoft Office feature/format fidelity is not claimed. Existing JSON backup import remains unimplemented.

## Library licenses and verification

Pinned processing libraries: pdf-lib (MIT), PDF.js (Apache-2.0), JSZip (MIT option), qrcode (MIT), docx (MIT), ExcelJS (MIT), pdfmake (MIT) and existing PptxGenJS (MIT). Dependency license notices remain in the installed packages and generated worker.

Unit tests verify PDF page counts/order, selection validation, Unicode word statistics, native DOCX package content, XLSX formulas/styles/shared-formula translation and empty document exports. Browser tests cover all eight utilities, invalid/corrupted input, actual download encodings, QR decoding with jsQR, public access, responsive layout, DOCX/PPTX editable XML, XLSX reopening with ExcelJS, PDF parsing with pdf-lib, and existing editor/demo regressions. Tests use format-aware parsers; Microsoft Office and LibreOffice desktop applications are not installed in the build environment.

## Authentication and synchronized production

The only allowed cloud project is **Syrka Workspace**, ref `zguejzlseldovdssiumn`. Public configuration is validated before creating the browser client; missing keys, secret keys or the old V12 URL cannot trigger a silent demo fallback. Requests have a 20-second timeout. Registration has explicit submit handling, visible field validation, progress and actionable API/SMTP errors. The confirmation callback is `/auth/callback`; expired links display an error and a route back to sign-in. Session refresh no longer closes an active editor, account changes clear old file state, and logout is available in the top bar on mobile.

The current provider accepted a QA registration and its email was found in the connected inbox. The verification URL targeted this project and redirected to the correct production callback, but was already invalid/consumed when exercised; successful fresh-link confirmation is not claimed. Default Supabase SMTP may restrict non-team recipients and rates. Public-recipient delivery still needs verification; do not enable paid SMTP or weaken email verification. Two temporary confirmed QA accounts were used to verify real login, session persistence, logout, autosave and cross-account RLS. Only these QA accounts and their test files were removed afterward. Existing owner-based RLS and the private storage bucket were unchanged.

`AGENTS.md` records the permanent workflow: fetch latest GitHub state, use PRs for substantial work, run required checks, commit/push tested work, and let Vercel deploy `main`. See `DEPLOYMENT.md` for operating and verification steps.

### Syrka Write 2

See [architecture audit](WRITE-2-AUDIT.md) and [release capabilities and limitations](WRITE-2-RELEASE.md). This is a compatible progressive upgrade to the existing Tiptap editor, with no database migration. Print preview runs locally using Paged.js; bundled Noto fonts are licensed under SIL OFL 1.1. No external writing-analysis service is used.

## Sessions and Notes (feature release)

Sessions and Notes extend Tools with meeting records, permissioned transcripts, reviewed notes, exports and Campus class entry points. Media, AI and speech features require eligible server-side configuration and hosted acceptance tests; they are disabled when configuration is missing. This branch does not claim a verified live communications rollout. See [architecture, provider audit, setup, test gates and limitations](docs/sessions-notes.md). Existing eight local utilities remain local; Sessions and Notes are explicit account-based cloud services.
