# Vibueno — agent rules

Multi-tenant white-label SaaS foundation (content approval, AI planning via Vercel AI Gateway, Buffer scheduling, Rebill credits). This repo follows Luigi's **verification-before-trust** pipeline ([PROPOSAL.md](docs/PROPOSAL.md) summarizes it).

## Pipeline gates (summary)

1. Linear spec with user-journey acceptance criteria.
2. Blast radius + TDD (`test` before implementation).
3. CI green on PR; `main` protected (required checks listed in the PR).
4. Independent adversarial review via pstack `interrogate` (models in `.cursor/rules/pstack-models.mdc`, routed through **Neon AI Gateway** — set `NEON_AI_GATEWAY_TOKEN` and `NEON_AI_GATEWAY_BASE_URL` locally; never commit).
5. `verify-vibueno` skill before claiming "listo".
6. Single deploy artifact (templates bundled in `build:pages`, not separate KV uploads).

## Rule → what enforces it

| Rule | What enforces it |
|------|------------------|
| Every HTML route ships in the same deploy as the Worker (no orphan `tpl:*` KV) | `hosted/build-pages.mjs` embeds `public/*.html` into `bundled-templates.mjs` + esbuild `public/_worker.js` |
| `/api/version` exposes the merged commit SHA | `BUILD_SHA` baked at build; `hosted/worker.js` `GET /api/version`; `tests/api_version.test.mjs` |
| Each registered route has a page and smoke marker | `hosted/routes.mjs` manifest; `scripts/check-route-manifest.mjs`; `tests/templates_bundled.test.mjs`; CI job **route-manifest** |
| CI blocks merge without tests, lint, typecheck, build | `.github/workflows/ci.yml` |
| Test-first for API and routing | `tests/*.test.mjs` run in CI job **unit-tests** |
| No secrets in repo | `.gitignore`, review; gateway auth via `NEON_AI_GATEWAY_*` / Vercel `AI_GATEWAY_API_KEY` in env only |
| Adversarial reviewers use Opus + Astra (not the author model) | `.cursor/rules/pstack-models.mdc` → `interrogate reviewers` |
| Evidence before "listo" | `.cursor/skills/verify-vibueno/SKILL.md` + `vibueno-feature-map.yaml` |
| Post-deploy read-only smoke | `scripts/smoke-vibueno.mjs` |
| New interactive UI uses Vercel UI SDK (`@ui-sdk/*`) with brand theme | Convention documented in `docs/decisions.md` (applied when UI ships) |
| Agents do not write production DBs from this repo until creds are scoped | No D1 bindings in foundation PR; migrations only on preview/local later |

## Layout

| Path | Purpose |
|------|---------|
| `hosted/` | Cloudflare Pages + Worker source, `npm run build:pages` |
| `tests/` | Node native unit tests |
| `scripts/` | Route manifest check, smoke |
| `docs/decisions.md` | Architecture decision log |
| `.cursor/skills/verify-vibueno/` | Verification skill + feature status |

## Local commands

```bash
npm ci && npm ci --prefix hosted
npm test
npm run build
cd hosted && npx wrangler pages dev public --port 8788
node scripts/smoke-vibueno.mjs --base http://127.0.0.1:8788 --sha "$(git rev-parse HEAD)"
```