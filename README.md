# Accounting Workbench

An accounting operations prototype developed by Rachit Raj for TMP, focused on CRM workflows, onboarding, time budgets, reconciliation, and invoice review. This standalone project is not yet connected to TMP's existing CRM.

## Shareable demo

- Live app: https://rachit-accounting-workbench.onrender.com
- Source: https://github.com/rachitr200/accounting-workbench
- Health: https://rachit-accounting-workbench.onrender.com/api/health

Frontend and backend are deployed together. Use fictional records only. The public version supports the working workflows and source lookup; a generative model is not hosted.

## Run it

The frontend production build is included. Python 3.9+ and internet access for first-time package installation are required. Node 18+ is needed only if rebuilding the frontend.

On macOS, open `start.command` in Terminal. Or from this project folder:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements-lock.txt
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8765
```

Open http://127.0.0.1:8765. Keep the terminal running. The local SQLite database is created in `data/workbench.sqlite3`; records persist across restarts. If port 8765 is busy, stop the previous copy or choose another port. Production builds are served by the backend on the same origin.

For frontend development:

```sh
cd frontend
npm ci
npm run dev
```

Start the backend on 8765 in a second terminal. Vite proxies `/api` to it. Use `npm run build` after changes and restart the backend if the build directory was not present at startup.

## What works

1. **CRM foundation:** create leads and clients, progress to onboarding, maintain document checklists, and activate after required documents are marked received. Marking a document missing moves an active client back to onboarding. This is checklist tracking, not file storage or verification of document contents.
2. **Jobs and staff time:** create budgeted jobs, record dated staff time, see remaining hours and overruns. There is no payroll integration or financial billing calculation.
3. **Follow-up workflow:** template-based client and overdue-invoice reminder drafts; batch generation; same-day duplicate prevention; explicit reviewed state. Browser actions never send email. A separately configured SMTP sender is included for operator-controlled use; dry-run is the default.
4. **Bank reconciliation:** import signed amounts from CSV, propose equal-amount/currency matches within three days, flag ambiguity, explicitly approve or reverse matches. Matching does not post to accounting software or settle AR/AP. Import is transactional; repeated identical IDs are skipped and conflicting IDs reject the entire batch.
5. **Accounts payable:** record invoices, identify possible duplicates by supplier and reference, block duplicate approvals, reject duplicates, and record approval. No payments are initiated.
6. **Accounts receivable:** record invoices, identify overdue records and prepare reminder drafts. Live settlement, partial payments, aging policy, credit notes and collections scheduling are not implemented.
7. **Knowledge desk:** add reviewed source text with jurisdiction and year; retrieve excerpts; optionally produce a draft through a locally hosted Ollama-compatible model. It abstains when no eligible source matches. The bundled source is a fictional procedure, not legislation.
8. **Activity and export:** local change log and JSON snapshot. This is not an immutable audit trail or a restore/backup service.

## JD additions, with CRM first

- **Rollout & impact:** ordered CRM-first acceptance checks, evidence-required verification, and saved pilot timing observations across CRM, accounting, tax, client service, marketing and internal operations. Net time reduction includes negative results. Figures are user-entered observations, not measured ROI.
- **Staff playbook:** onboarding, reconciliation, source review and failure-recovery procedures; reusable client-service, tax-source and marketing prompts; integration handover guidance. Templates do not invoke external models or publish messages.
- The prototype does not establish that TMP’s CRM is complete, integrations are active, or a trained tax model is deployed.

## What is and is not an AI agent

Financial workflow controls are deterministic Python code with Pydantic validation. They do not need an LLM to compare amounts, calculate budgets, block duplicate approvals, or generate standard reminders. No LLM can approve a match, send money, or modify records.

The optional knowledge assistant is the only generative-AI feature. No model, embeddings service, API credential, or fabricated tax corpus is bundled. Without a configured local model, the UI explicitly shows source lookup only. There is no hidden cloud-model fallback.

## Local model connection

Run an Ollama-compatible server on `http://127.0.0.1:11434` with an appropriate model installed, then start the workbench with the exact model name:

```sh
export OLLAMA_MODEL='your-installed-model-name'
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8765
```

Select 'Use configured local model' in Knowledge desk. Only the documented loopback endpoint is accepted. The server receives the question and eligible source excerpts. Model weights and licences must be selected and checked for the intended deployment; the app does not download them or select a hardware size for you.

Retrieval currently uses keywords, jurisdiction and year filters. This is not a production tax RAG system. Citation IDs are checked for membership in the retrieved sources, but that does not establish that a claim is entailed or legally correct. Accountants must review outputs. Tax-year tagging alone does not model effective dates, amendments, superseded provisions, or federal/provincial/state differences. These are required extensions before a real tax assistant.

The model adapter is covered by mocked contract tests. A real local model was not installed or exercised during this build.

## Sample import

Open Reconciliation > Import CSV. Import `examples/ledger.csv` into ledger entries and `examples/bank.csv` into bank transactions. Columns must be exactly:

```text
id,description,reference,amount_cents,currency,txn_date
```

Use integer cents (125000 means CAD 1,250.00), CAD or USD, and ISO dates. Negative amounts represent outflows. A dataset should represent one account with one consistent signed-amount convention. Multi-account reconciliation, foreign-exchange conversion, partial matches and one-to-many matches are not implemented. Up to 1,000 rows / 1 MB per import in the UI.

## Verification

```sh
.venv/bin/python -m pytest tests -q
cd frontend
npm run build
```

Tests cover onboarding controls, reminder idempotency, duplicate payables, one-to-one matching, currency/date boundaries, atomic imports, integer-money validation, time limits, source filtering, unsupported questions, local model contracts, origin restrictions, persistence and logging.

## Source references

- https://github.com/rachitr200/acto-superagent — reference commit `82b2a8b`: React/FastAPI structure and structured model responses. The latest repository uses OpenAI; the supplied archive used Anthropic. Its CRM actions are suggestions, not a deployed CRM integration.
- https://github.com/rachitr200/freight-bidding-agent — reference commit `658765d`: staged workflow, Pydantic schemas and activity-tracking patterns. This workbench implements accounting-specific controls rather than copying freight scoring or fallback decisions.

The React/Vite dependency setup was retained from the SuperAgent project. The accounting UI, SQLite storage, financial review rules, import flow and tests are new implementation. This prototype does not use LangGraph; staged deterministic operations and a small model adapter are sufficient for its current scope.

## Before connecting to TMP

Local mode is a single-operator application and must stay on localhost. Public demo mode gives each browser a separate temporary sample workspace using a signed session cookie. This is not production user authentication or business tenant isolation. Neither mode provides role authorization, encrypted database storage, tamper-proof auditing, malware-scanned document storage, backups or production monitoring. Use fictional data only. It is not a certified compliance product, accountant replacement, trained tax model, or finished TMP CRM.

The next implementation must begin with TMP's codebase, stack, access permissions, defect list, acceptance criteria, accounting system interfaces and approved email provider. Add identity and access control, proper source provenance, evaluation by tax experts, migrations/backups, operational monitoring, and a controlled rollout.

## Optional email adapter

`python -m backend.send_reviewed` lists eligible reviewed drafts without connecting to any mail service. Sending requires both `--id <draft-id> --send` and `SMTP_ENABLED=true`, plus SMTP_HOST, SMTP_PORT (465 or 587), SMTP_FROM, SMTP_USERNAME and SMTP_PASSWORD in the process environment. Do not put secrets in source control. The adapter refuses sample/reserved recipient domains. It uses TLS, claims a reviewed draft before sending, and marks uncertain outcomes for manual review rather than retrying automatically. SMTP acceptance is not proof of delivery. Sending was not exercised against a live provider during this build.

A scheduled automatic sender is deliberately not enabled. It requires an approved provider, real identity/access controls, reviewed automation policies, and confirmed recipients. The batch-draft endpoint `/api/automations/followups` can prepare reminders repeatedly without creating duplicates for the same item on the same day.

## Public demo on Render

The included `render.yaml` deploys one free Docker web service. The React frontend and FastAPI backend share one HTTPS origin; no separate API URL is required. The Docker build compiles the frontend from source.

Set `PUBLIC_DEMO=true` and a generated `SESSION_SECRET` (at least 32 characters). The Blueprint generates this secret automatically. Each visitor receives a separate temporary SQLite workspace. Public mode disables local model generation and real email sending is not exposed through the API. Source lookup and sample accounting workflows remain available.

Render free services may sleep when idle and their local storage is temporary. Sample changes can disappear on restart or redeploy; this deployment is for demonstrations only. Do not enter real client data.
