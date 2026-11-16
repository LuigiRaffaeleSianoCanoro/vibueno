# Development pipeline (summary)

Full proposal: *Verificación antes que confianza* (14 Nov 2026). Key points for agents:

- **Single artifact deploy** — everything served must be in the Pages bundle; separate KV template uploads caused production incidents on agent-os.
- **Definition of done** — evidence package (preview/prod URL, served SHA, video, smoke, adversarial findings), not agent assertion.
- **Autonomy levels** — start at Level 0 (human OK for merge/deploy).
- **Corrections become checks** — architecture first, then lint/types/tests.

See the upstream PROPOSAL attached to FAB-190 / team docs for the complete Spanish text and metrics.