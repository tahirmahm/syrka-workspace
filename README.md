# Syrka Workspace

A Next.js App Router / TypeScript workspace MVP with a responsive dashboard, Tiptap-powered Syrka Write, Univer-powered Syrka Tables, and React-based Syrka Present with PptxGenJS exports. UI uses Tailwind CSS and a shadcn/ui Button built on Radix Slot.

## Run locally

Requires Node.js 22+ and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. On the sign-in screen, choose **Try demo — no account needed** to open a browser-local workspace preloaded with Write, Tables, and Present sample files. Demo entry is remembered for the current tab across reloads; **Exit demo** returns to sign-in. Demo files stay in this browser and are separate from authenticated cloud files. Without Supabase configuration, a **clearly labeled local demo** stores files and embedded images in this browser's localStorage. Demo data does not upload or migrate automatically. Browser storage limits apply; a quota error is displayed as a save failure.

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

No Docker, WebSocket service, office server, service role credential, or persistent Vercel filesystem is required. The connected Supabase project has the workspace migration applied. The Vercel CLI is authenticated and this checkout is linked to the `syrka-workspace` project in the existing Syrka team. Supabase public configuration is configured for Production, Preview, and Development. Deployment settings are in `vercel.json`.

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

No real-time multiplayer, sharing, version history, comments, password reset UI, DOCX/XLSX/PPTX import, or DOCX/XLSX export. Microsoft Office format compatibility is not claimed. CSV is a single-sheet interchange format; formatting and formulas are not retained on export. PPTX export supports the modeled text/rectangles/images and can differ in font metrics and wrapping. Present uses plain text, numeric resizing and rectangular shapes; no animation, charts or complex grouped objects. Write image signed URLs refresh on reopen; reopen after an hour if an image expires. Deleting a file does not delete its assets because duplicated files can reference the same image; unused asset cleanup is a future maintenance task. Concurrent tabs use last-write-wins; v1 is intended for one editor per file at a time. Files are downloaded in full; large workbooks and huge file collections are outside this MVP's performance scope.

## Product naming and compatibility

The suite is **Syrka Workspace**. Its product names are **Syrka Write**, **Syrka Tables**, **Syrka Present**, and **Syrka Create** (creative and design tools). Within Workspace, labels use Write, Tables, Present, and Create. Create is reserved in the product catalog; this MVP has no creative editor, so it has no launcher.

This branding update preserves persisted `doc`, `sheet`, and `slides` kinds, the `syrka-office-v1` browser storage key, `office_files` database table, `office-assets` private bucket, editor JSON models and file formats. The app continues to use its original `/` entry point; no public routes were removed or changed, so no URL redirects are needed. Existing user file names and content are never rewritten for branding. Internal editor filenames remain stable.

## Brand and device downloads

The interface uses Syrka’s monochrome symbol and wordmark, including a matching app icon, while retaining the original layout. Existing document formatting and presentation colors are unchanged.

Every file card and editor header has a **Download** menu. Write exports a self-contained HTML document with embedded images; Present exports PPTX. Every file can also download a versioned `.syrka.json` backup with embedded images. Tables backups preserve all worksheets, cell formulas and formatting; active-sheet CSV remains available in the Tables toolbar. Backups are downloadable JSON; importing backups is not yet implemented. HTML opens in a browser and can be printed to PDF. These downloads do not claim full Office format compatibility.
