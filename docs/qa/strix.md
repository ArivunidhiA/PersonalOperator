# Strix (AI pentest) runs

Strix (`usestrix/strix`) is an open-source agent that probes a running app. Only point it at your own local or preview deployment, never production.

## Locally (Docker required)

```bash
pipx install strix-agent
export STRIX_LLM="anthropic/claude-sonnet-5-5"
export LLM_API_KEY=...   # never commit
cd web && npm run dev -- -p 3100   # in another terminal
strix --target http://localhost:3100
```

Results land in `strix_runs/`. Copy confirmed findings into `docs/qa/known-risks.md` (ID, impact, detection, regression test).

## In CI

Copy `.github/workflows/strix.yml` to `.github/workflows/strix.yml` (the bot token lacks `workflow` scope, so Ari must add it). Then Actions > "Strix security scan" > Run workflow, with a preview URL. Needs repo secret `STRIX_LLM_API_KEY` (optional var `STRIX_LLM`). Manual only; it spends LLM credits.

## Status

First run not done: Docker was unavailable on the machine where this was written (2026-10-30). Run it locally and file findings.
