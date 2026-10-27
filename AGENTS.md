# Syrka Workspace working agreement

- GitHub `tahirmahm/syrka-workspace` is the source of truth. Fetch upstream before starting and before pushing; preserve upstream changes and user data.
- Commit and push completed, tested work. Use feature branches and pull requests for substantial/risky changes. Include branch and commit SHA in completion reports.
- Before committing run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, plus relevant browser tests.
- Production deploys ONLY through Vercel's Git integration from `main` to `https://syrka-workspace.vercel.app`, project `syrka-workspace`. Do not run independent CLI/API deployments unless the user explicitly requests them.
- Verify GitHub commit SHA against production deployment metadata before claiming deployment success.
- Dedicated Supabase project: `zguejzlseldovdssiumn` (`https://zguejzlseldovdssiumn.supabase.co`), table `public.office_files`, private bucket `office-assets`. Preserve ownership RLS. Never use the old Syrka.V12 project.
- Only publishable keys may enter frontend configuration. Never commit `.env` files, tokens, service-role keys or build artifacts.
- Never silently enter demo mode due to invalid cloud configuration. Demo is an explicit user choice and local-only.
- All infrastructure must remain free-tier. No paid features, upgrades or SMTP services without explicit approval.
- Public Tools process files locally; no server uploads or file-content persistence.
