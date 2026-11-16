# Decision log — Vibueno

## 2026-11-16 — Stack: Cloudflare Pages + Worker + D1 + KV (FAB-190 foundation)

**Context:** Multi-tenant white-label SaaS with per-agency custom domains, PWA, Buffer/Rebill integrations, and AI via Vercel AI Gateway. Reference pattern: agent-os (bundled templates, `/api/version`), but without copying its data or bindings.

**Decision:** Use **Cloudflare Pages** with an advanced-mode **Worker** (`hosted/public/_worker.js`), **D1** for relational tenant/post data, and **KV** for session/cache flags — same family as agent-os.

**Why not Vercel-only (Next.js)?**

- **Custom hostnames per agency** map cleanly to [Cloudflare for SaaS](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/) (SSL + routing) with Workers as the origin; avoids per-tenant Vercel project sprawl.
- **Single static+worker artifact** matches the incident lesson from agent-os (no split KV template deploy).
- **Free tier** for Pages, Workers, D1, and KV is sufficient for early tenants.
- **Vercel AI Gateway** remains the AI provider surface; Workers call it server-side with `AI_GATEWAY_API_KEY` (or OIDC on Vercel-side services) — no provider keys in the repo.

**UI:** New interactive surfaces will use **Vercel UI SDK** (`@ui-sdk/core`, `@ui-sdk/web`) themed per agency when product UI lands (foundation is static shell only).

**Foundation PR scope:** Shell page, version API, CI, verify skill skeleton — **no** remote D1/KV creation, **no** deploy.

**Status:** Accepted for FAB-190.

## 2026-11-16 — Adversarial review models (pstack)

**Decision:** `interrogate reviewers` → Claude Opus + **gpt-6-astra** via **Neon AI Gateway** (`NEON_AI_GATEWAY_TOKEN`, `NEON_AI_GATEWAY_BASE_URL`). No API keys in the repository.

**Status:** Configured in `.cursor/rules/pstack-models.mdc` (`interrogate reviewers` use gateway slugs `claude-opus-5-5` and `gpt-6-astra`).

## 2026-11-16 — `main` branch protection (pending)

**Context:** FAB-190 AC1 requires a protected `main` with required CI checks.

**Decision:** Document required GitHub Actions job names in the PR and `AGENTS.md`; **enable branch protection after merge** when Luigi confirms.

**Blocker:** Private repo on GitHub Free returns HTTP 403 when configuring protection (`Upgrade to GitHub Pro or make this repository public`). **Pending Luigi:** upgrade to GitHub Pro, make the repo public, or accept manual merge discipline until protection is available.

**Status:** Pending (not enforced in this foundation PR).

## 2026-11-16 — Deploy / smoke / rollback workflow

**Decision:** Add `.github/workflows/deploy.yml` (`workflow_dispatch` only). It builds the single artifact and documents the intended order (preview deploy → smoke → promote → prod smoke → rollback on failure). Real wrangler deploy steps stay gated on `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` (not set in foundation).

**Status:** Skeleton merged with FAB-190; live deploy in a follow-up issue/PR.