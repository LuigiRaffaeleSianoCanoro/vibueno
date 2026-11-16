# Vibueno

White-label SaaS for community managers and agencies: content approval, AI planning (Vercel AI Gateway), Buffer scheduling, and prepaid credits (Rebill sandbox).

**FAB-190 (this foundation):** Cloudflare Pages + Worker skeleton, CI, `verify-vibueno` skill, and docs — no product features yet.

See [AGENTS.md](AGENTS.md), [docs/decisions.md](docs/decisions.md), and Linear [FAB-190](https://linear.app/fabricadecontenido/issue/FAB-190/armar-el-repo-privado-con-ci-main-protegido-y-verify-skill).

## Deploy (Cloudflare Pages)

After merge to `main`, the **CI** workflow runs the seven required checks; on success, **Deploy** builds once and uploads `hosted/public` with pinned `wrangler@4.45.0`, then runs `scripts/smoke-vibueno.mjs` against production (SHA match + `vibueno-shell`). Failed smoke triggers a Pages rollback via `scripts/pages-deploy-lib.mjs`.

Configure GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN` — **Account → Cloudflare Pages → Edit** (account `972c81007a876887bb25628c5fc12166`). Do not grant unrelated permissions.
- `CLOUDFLARE_ACCOUNT_ID` — `972c81007a876887bb25628c5fc12166`

Until both secrets exist, **Deploy** exits successfully with a skip notice (CI still gates merges). For the very first production upload, set repo variable `VIBUENO_ALLOW_FIRST_DEPLOY=true` once.
