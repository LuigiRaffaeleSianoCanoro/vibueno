---
name: verify-vibueno
description: Verify Vibueno (Cloudflare Pages): shell, /api/version, smoke markers. Use before claiming "listo".
---

# verify-vibueno

## Feature map (FAB-190 baseline)

| Feature | Route / API | Marker | Status |
|---------|-------------|--------|--------|
| Shell | `/` | `vibueno-shell` | **Yes** |
| Login | `/login` | `vibueno-login` | No |
| Approval | `/approval` | `vibueno-approval` | No |
| Planning | `/planning` | `vibueno-planning` | No |
| Buffer wizard | `/settings/buffer` | `vibueno-buffer-wizard` | No |
| Credits (Rebill sandbox) | `/settings/credits` | `vibueno-credits` | No |
| Version API | `/api/version` | (JSON `sha`) | **Yes** |

Canonical list: `vibueno-feature-map.yaml`.

## Launch (local)

```bash
npm ci && npm ci --prefix hosted
npm run build
cd hosted && npx wrangler pages dev public --port 8788
```

Ready when log shows `Ready on http://localhost:8788`.

No auth in foundation PR — smoke is read-only.

## Doctor (read-only smoke)

```bash
node scripts/smoke-vibueno.mjs \
  --base http://127.0.0.1:8788 \
  --sha "$(git rev-parse HEAD)"
```

Production/preview (after deploy exists):

```bash
node scripts/smoke-vibueno.mjs --base https://<pages-host> --sha "<merge-sha>"
```

## Drive (manual / Playwright)

1. Open `/` — expect `data-testid="vibueno-shell"` and title **Vibueno**.
2. `curl -sS "$BASE/api/version" | jq` — `ok: true`, `sha` matches merge (or CI `GITHUB_SHA` on preview).

Do **not** exercise login, approval, Buffer, or credits until those features exist.

## Evidence

Store under `evidence/verify-vibueno/` (gitignored): desktop + mobile screenshot, `smoke.log`.

## Cleanup

Stop `wrangler pages dev`; keep evidence unless instructed.