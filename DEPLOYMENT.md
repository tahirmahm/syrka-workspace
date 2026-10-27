# Production workflow

- Repository: https://github.com/tahirmahm/syrka-workspace
- Vercel project: syrka-workspace
- Production branch: main
- Workspace address: https://syrka.co/workspace
- Standalone/compatibility domain: https://syrka-workspace.vercel.app
- Supabase project: Syrka Workspace, zguejzlseldovdssiumn

## Release

1. Fetch origin and start from latest main. Preserve local/upstream work.
2. Use a feature branch and PR for substantial/risky changes.
3. Run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` and relevant `npm run test:e2e` checks.
4. Commit/push, inspect PR checks, then merge through the normal GitHub workflow when permitted.
5. Vercel's Git integration deploys main automatically. Do not run independent deployments.
6. Inspect the production deployment and verify `meta.githubCommitSha` matches `origin/main`; verify its `readyState` is READY. Check the production site and required routes.

No credentials or infrastructure settings should be replaced during a release. This application needs only free-tier Vercel/Supabase resources. Do not enable upgrades, paid integrations or SMTP services without explicit permission.

## Configuration

Frontend variables are `NEXT_PUBLIC_SUPABASE_URL=https://zguejzlseldovdssiumn.supabase.co` and this project's publishable key. The key must start `sb_publishable_`; never use a service-role/secret key. Public variables are bundled at build time, so changed values require a new Git-triggered build. Local `.env.local` is ignored. The code rejects the old Syrka.V12 URL instead of silently using it.

Supabase Auth Site URL should be `https://syrka-workspace.vercel.app`. Allow `https://syrka-workspace.vercel.app/auth/callback` and explicitly approved local/preview callback origins. Keep email confirmation enabled. The callback handles Supabase implicit-session redirects and PKCE codes and visibly reports expired links.

The database table is `public.office_files`, with owner-based SELECT/INSERT/UPDATE/DELETE policies. UPDATE must preserve ownership with both USING and WITH CHECK. `office-assets` must remain private. Do not reapply initial migration SQL to an already initialized project.

## Authentication verification

- Submit invalid fields and confirm visible validation. Submit valid registration and inspect its `/auth/v1/signup` request to the dedicated project.
- A 200 signup response alone does not prove email delivery. Verify the confirmation email and fresh link in the recipient inbox.
- Default Supabase SMTP restricts authorized recipients and volume; errors must remain visible. Free custom SMTP would require separate approved account setup. No paid SMTP was enabled.
- Test login/logout and reload persistence. Edit a document, wait for Saved, reload and reopen it.
- With isolated QA accounts A/B, verify B cannot list/read/update/delete A's files or insert a row owned by A. Never alter real users or production ownership policies to make a test pass.
- QA accounts and their files must be removed only by exact test IDs/markers, without touching real users.

Tools are public and browser-only. They require no Supabase credentials or uploads. Office exports run locally; private document images are retrieved with the existing authenticated storage access and embedded into the user's download.

## Shared syrka.co path

The Workspace Next.js app uses `basePath: /workspace`. Native Next links and assets inherit it; the PDF worker and auth callback use `workspacePath()`. Root, legacy Tools URLs and legacy callback URLs on the standalone host redirect to their `/workspace` equivalents. Existing browser-local data on that host retains its storage origin. Browser-local demo data is not automatically shared across hostnames; cloud files remain accessible after sign-in.

`syrka.co` remains assigned to the existing `syrka12` project, repository `tahirmahm/syrka.v12`, production branch `main`. That repository's Vercel config rewrites only `/workspace` and `/workspace/:path*` to the Workspace production host, preserving the prefix. No domain/DNS reassignment or nameserver changes are needed. Deploy Workspace path support first, then merge the root-site rewrite through Git.

Supabase Auth must allow `https://syrka.co/workspace/auth/callback`, and the standalone host's `/workspace/auth/callback` should also be allowed. Existing sign-in continues to use the same dedicated project and ownership policies. The available connector does not expose Auth URL configuration; an administrator must add these redirects in Supabase Auth → URL Configuration.
