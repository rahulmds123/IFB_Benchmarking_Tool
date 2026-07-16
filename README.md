# BOM Benchmarking Tool

Cross-brand Bill of Materials (BOM) benchmarking for washing machines and
air conditioners. Upload BOM spreadsheets for IFB and competitor products,
get an automatically cleaned and cross-referenced comparison, AI-assisted
engineering analysis (Quick or Detailed), and downloadable PDF reports.

FastAPI backend + React/Tailwind frontend. This README covers setup for
both, from a fresh clone to a running local instance.

---

## 1. Prerequisites

| Tool | Version | Check with |
|---|---|---|
| Python | 3.10+ | `python3 --version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ (ships with Node) | `npm --version` |

You'll also need an **OpenRouter API key** (free tier works) for the AI
analysis features — get one at [openrouter.ai](https://openrouter.ai).
The app still runs without one for upload/normalize/presence-matrix
features; only the AI analysis calls will fail until a key is set.

---

## 2. Project structure

```
project-root/
├── app/
│   ├── bom.py                     — FastAPI app entrypoint (all routes)
│   └── services/
│       ├── __init__.py
│       ├── bom_services.py        — washing machine cleaning/normalization + shared helpers
│       ├── ac_bom_services.py     — AC (IDU/ODU) cleaning/normalization
│       ├── llm_analysis.py        — Quick/Detailed AI analysis prompts + OpenRouter calls
│       └── report_pdf.py          — PDF report builder (ReportLab)
├── frontend/
│   ├── src/
│   │   ├── api/client.js          — axios calls to every backend endpoint
│   │   ├── components/
│   │   │   ├── FileUploadPanel.jsx
│   │   │   ├── NormalizationComplete.jsx
│   │   │   ├── AssemblyWorkspace.jsx
│   │   │   ├── PresenceMatrix.jsx
│   │   │   ├── ComponentsGrid.jsx
│   │   │   ├── ComponentDetailModal.jsx
│   │   │   └── AnalysisResultPanel.jsx
│   │   ├── App.jsx                — step-wizard state machine + top nav
│   │   └── index.css              — Tailwind layers + light theme base
│   └── tailwind.config.js
├── datasets/                      — sample/working BOM files (kept separate, not inside app/ or frontend/)
├── requirements.txt
└── .env                           — backend secrets (never commit this)
```

> **File naming note:** `app/bom.py` imports from `app.services.report_pdf`
> and `app.services.ac_bom_services` (lowercase, underscores). If any file
> in `services/` gets renamed with different casing (e.g. `Report_pdf.py`),
> update the corresponding import in `bom.py` to match exactly — Linux
> filesystems (and most deployment servers) are case-sensitive even though
> Windows isn't, so a mismatch that works on your PC can fail silently on
> a server.

---

## 3. Backend setup

From the project root:

```bash
# 1. Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set your OpenRouter API key
export OPENROUTER_API_KEY=sk-or-...     # Windows (PowerShell): $env:OPENROUTER_API_KEY="sk-or-..."

# 4. Run the server
uvicorn app.bom:app --reload --host 0.0.0.0 --port 8000
```

The API is now live at `http://localhost:8000`. Visit
`http://localhost:8000/docs` for the interactive Swagger UI — useful for
testing endpoints directly without the frontend.

### Backend dependencies (`requirements.txt`)

| Package | Used for |
|---|---|
| `fastapi` | web framework / routing |
| `uvicorn[standard]` | ASGI server |
| `python-multipart` | required for `File(...)`/`Form(...)` — file uploads will fail with a 422 without this |
| `pandas` | BOM cleaning, alignment, cross-company merging |
| `openpyxl` | reading/writing `.xlsx`, red-font NA highlighting on exported files |
| `openai` | OpenRouter client (OpenAI-compatible API) for AI analysis |
| `reportlab` | PDF report generation |

### Backend environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `OPENROUTER_API_KEY` | Yes, for AI analysis | — | App **fails to start** without this set at all (not just when analysis is used) — see Troubleshooting. |
| `LLM_MODEL` | No | `openai/gpt-oss-20b:free` | Override to point at a different OpenRouter model, e.g. the paid tier of the same model to lift the free-tier rate limit. |

---

## 4. Frontend setup

From `frontend/`:

```bash
npm install
npm run dev
```

Runs on `http://localhost:5173` by default.

### Pointing at your backend

Defaults to `http://localhost:8000`. To point at a different host/port
(e.g. a deployed backend, or a different local port), create `frontend/.env`:

```
VITE_API_BASE_URL=http://localhost:8000
```

### Frontend dependencies

Installed via `npm install` from `frontend/package.json` — notably
`react`, `axios`, and `tailwindcss`. No manual dependency setup needed
beyond `npm install`.

---

## 5. Running both together

Two terminals, from project root:

```bash
# Terminal 1 — backend
source venv/bin/activate
uvicorn app.bom:app --reload --port 8000

# Terminal 2 — frontend
cd frontend
npm run dev
```

Open `http://localhost:5173`. Upload a couple of BOM files and you should
land in the analysis workspace.

---

## 6. What the app does

**Upload** — drag/drop 2–5 Excel BOM files, assign a company name to each
(pre-filled from the filename, editable), pick a product type.

**Product type: Washing machine vs AC**
- Washing machine: one BM sheet per file, spec columns include Thickness, no Colour.
- AC: each file must contain both a `Detailed BM Chart - IDU` and a
  `Detailed BM Chart - ODU` sheet. Spec columns include Colour, no
  Thickness. Every row is tagged with its source unit, so the frontend can
  scope everything to just the indoor or outdoor unit (see §7).

**Normalize** — backend cleans, aligns, and cross-references components
across all uploaded companies, then shows a completion screen with
file/assembly counts and two actions: download the normalized ZIP, or
proceed to analysis.

**Analysis workspace** — for AC jobs, first pick Indoor or Outdoor unit;
this determines which assemblies are selectable. Then:
- Pick an assembly.
- **Presence matrix** — green check / red x per company per component.
- **Components grid** — card per component with a coverage bar (`X/Y`
  companies reporting it). Click a card to open a detail modal: spec
  comparison table, rule-based insights, and on-demand AI analysis.
- **"Show important components only"** filters down to the top-N heaviest
  components present across every company.

**Quick vs Detailed analysis**
- **Quick** — fast, scannable summary per component, for scanning many
  components at once.
- **Detailed** — full engineering reasoning: standing vs competitors,
  strengths, weaknesses with competitor references, improvement
  suggestions with cost/risk tradeoffs. Meant for one or a few components.

**PDF report download** — scope selector:
- **Full** — presence matrix + ranking + spec tables + AI analysis.
- **Specs only** — ranking + spec tables, no AI call made.
- **Matrix only** — just the presence matrix, no AI call made.

For AC jobs, reports are scoped to whichever unit is currently selected.

---

## 7. IDU/ODU scoping (AC only)

Every AC data row carries a `Unit` tag (`"IDU"` or `"ODU"`) set at upload
time. Washing machine data has no such column, so unit-scoping is a safe
no-op there — nothing AC-specific leaks into the washing machine flow.

- `GET /job/{id}/assemblies` returns `assemblies_by_unit: {idu: [...], odu: [...]}` in addition to the flat `assemblies` list, but only for AC jobs.
- `presence-matrix`, `top-components`, and `report` all accept an optional `?unit=IDU|ODU` param that filters the data before anything else runs.
- The frontend's unit toggle drives all of this automatically.

---

## 8. API contract

- `POST /upload` — multipart: `files` (2–5 `.xlsx`), `company_names` (one per file), `product_type` (`"washing_machine"` | `"ac"`, defaults to washing machine). Returns the normalized ZIP as the response body, `job_id` in the `X-Job-ID` header. 400 on a bad `product_type` or malformed AC file.
- `GET /job/{job_id}` — `{ job_id, companies, product_type }`.
- `GET /job/{job_id}/assemblies?unit=` — `{ assemblies, product_type, assemblies_by_unit? }`.
- `GET /job/{job_id}/presence-matrix?assembly=&unit=` — array of `{ Component, [companyName]: 0 | 1, ... }`.
- `GET /job/{job_id}/top-components?assembly=&top_n=&unit=` — top-N heaviest components with valid weight data across every company, plus full spec rows.
- `GET /job/{job_id}/component?name=` — single-component spec comparison + rule-based insights + AI analysis.
- `POST /job/{job_id}/multi-component?analysis_mode=quick|detailed` — body is a raw JSON array of component names.
- `GET /job/{job_id}/report?assembly=&top_n=&analysis_mode=&report_scope=&unit=` — streams a PDF. `report_scope` is `full` | `specs` | `matrix`.
- `DELETE /job/{job_id}`.

If a response shape ever needs to change, the only files affected are
`src/api/client.js` and the small mapping logic in whatever component
calls it — nothing else assumes a wire format beyond what `client.js`
already normalizes.

---

## 9. Deployment notes

- **CORS** is currently restricted to `localhost` origins in `app/bom.py`
  (via `allow_origin_regex`). Update this before deploying the backend
  anywhere the frontend won't be on `localhost`.
- **`JOB_STORE` is in-memory** — all uploaded jobs are lost on server
  restart. Fine for local/demo use; not suitable for production without
  adding real persistence (e.g. Redis, a database) first.
- **`OPENROUTER_API_KEY` must be set in the server's actual environment**,
  not just your local shell — e.g. as a secret/environment variable in
  whatever platform you deploy to (Render, Railway, a VM's systemd unit,
  etc.), not hardcoded anywhere in the repo.

---

## 10. Troubleshooting

**Backend won't start / crashes immediately on import.**
`llm_analysis.py` reads `OPENROUTER_API_KEY` at import time
(`os.environ["OPENROUTER_API_KEY"]`), so the app fails to start at all if
it's unset — not just when you try to use AI analysis. Set the env var
before running `uvicorn`, even if you don't plan to use AI features yet.

**File upload returns 422 Unprocessable Entity.**
Almost always a missing `python-multipart` install — required for
FastAPI's `File(...)`/`Form(...)` to parse multipart form data at all.
`pip install python-multipart` (already in `requirements.txt`, but easy
to miss if you installed packages manually instead of via the file).

**Frontend shows a network/CORS error in the browser console.**
Check `VITE_API_BASE_URL` in `frontend/.env` actually points at your
running backend, and that the backend's `allow_origin_regex` in
`app/bom.py` matches the frontend's actual origin (port included).

**AI analysis returns an "unavailable" error in the UI instead of crashing.**
This is intentional — LLM call failures are caught and surfaced as
`{"error": "..."}` rather than a 500, so the rest of the app (specs,
presence matrix) stays usable even if the AI call fails. Common causes:
missing/invalid `OPENROUTER_API_KEY`, or the free-tier rate limit (20
requests/minute, 50/day) — see the error text itself, OpenRouter's
message usually says which one.

**Port already in use.**
`uvicorn app.bom:app --reload --port 8001` (or any free port) — just
remember to update `VITE_API_BASE_URL` to match.

---

## 11. Design notes

Light theme — white page, slate-900 text, brand red (`#DC2626`) for
primary actions and active nav/unit/mode state, green/red for presence
and standing badges. One step fills the screen at a time (see `App.jsx`'s
step machine) rather than an always-visible dashboard; cards use real
borders + shadows; presence/coverage use visual indicators (check/x
badges, progress bars) rather than dense tables, except inside the
component detail modal where spec tables intentionally stay
dense/monospace — that's the one place tabular density is the right call.

The AI insight panel is labeled "AI insights · Engineering analysis," not
tied to a specific model name, since `LLM_MODEL` can point at a different
model without the label becoming inaccurate.
when on the analysis page if you want to print the reports of selected components,select the components and where you  can see report selected for 2,3 etc directly press that to print the report dont press any analyse buttons(saves tokens).

---

## 12. Known gaps / not yet done

- **No auth or persistence** — see Deployment notes above.
- **No mobile layout pass** — the workspace assumes a reasonably wide viewport.
- **No charts** — weight comparisons are numbers/badges, not visualized.
- **AC dimension sub-column parsing is lightly tested** — verified against synthetic data shaped to match the original script's logic, not yet against a real IFB AC BOM file. Worth a real-file smoke test before production use.
##13. Requirements
 --- Web framework ---
fastapi>=0.110.0
uvicorn[standard]>=0.29.0
python-multipart>=0.0.9   # required for File(...)/Form(...) uploads in /upload
Data handling
pandas>=2.2.0
openpyxl>=3.1.2           # reading/writing .xlsx, red-font NA highlighting
 LLM (OpenRouter via the OpenAI-compatible client) 
openai>=1.30.0
 PDF report generatio
reportlab>=4.1.0
 
