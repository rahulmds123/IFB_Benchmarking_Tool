# BOM benchmarking — frontend

React + Tailwind wizard-style app for cross-brand BOM (Bill of Materials)
benchmarking. Supports two product lines — **washing machines** and **AC
units** (indoor/outdoor split) — and produces both interactive analysis and
downloadable PDF reports. Built against the FastAPI backend's job/session
endpoints.

This replaces an earlier always-visible 3-column dashboard. The current UI
is a guided, single-focus step flow: upload → normalize → pick a
unit/assembly → browse presence + components → analyze → download.

## Setup

```bash
npm install
npm run dev
```

Runs on `http://localhost:5173` by default.

## Pointing at your backend

The API base URL defaults to `http://localhost:8000`. To point at a
different host/port, create a `.env` file in the project root:

```
VITE_API_BASE_URL=http://localhost:8000
```

## What the app actually does

**1. Upload** — drag/drop 2–5 Excel BOM files, assign a company name to
each (pre-filled from the filename, editable), pick a product type.

**2. Product type: Washing machine vs AC**
- Washing machine: one BM sheet per file, spec columns include Thickness,
  no Colour.
- AC: each file must contain both a `Detailed BM Chart - IDU` and a
  `Detailed BM Chart - ODU` sheet. Spec columns include Colour, no
  Thickness. The backend combines IDU + ODU into one dataset per company
  but **tags every row with its source unit**, so the frontend can scope
  everything to just the indoor or outdoor unit — see "IDU/ODU scoping"
  below.

**3. Normalize** — backend cleans, aligns, and cross-references components
across all uploaded companies. Frontend shows an animated progress card,
then a completion screen with file/assembly counts and two actions:
download the normalized ZIP, or proceed to analysis.

**4. Analysis workspace** — for AC jobs, first pick **Indoor unit** or
**Outdoor unit** (pill toggle); this determines which assemblies are even
selectable. Then:
- Pick an assembly from the dropdown.
- **Presence matrix** — green check / red x per company per component.
- **Components grid** — card per component with a red coverage bar
  (`X/Y` companies reporting it). Click a card to open a detail modal:
  full spec comparison table, rule-based insights, and AI insights for
  that one component.
- **"Show important components only"** toggle filters the matrix/grid down
  to the top-N heaviest components present across every company (same set
  the bulk "Analyze important components" button uses).

**5. Quick vs Detailed analysis** — a mode toggle in the workspace toolbar:
- **Quick** — fast, scannable bullet-point summary per component. Meant
  for scanning many components at once (e.g. the whole important-components
  set).
- **Detailed** — full engineering reasoning: standing vs competitors,
  strengths, weaknesses with competitor references, improvement
  suggestions with cost/risk tradeoffs. Meant for one or a few components.

  The "Analyze important components" button runs whichever mode is
  selected across the important-components set and shows the result inline
  above the presence matrix. The per-component detail modal always shows
  the full/detailed depth regardless of this toggle — it's analyzing one
  component already, so "quick" wouldn't add value there.

**6. PDF report download** — a scope selector next to the download button:
- **Full** — presence matrix + top-N ranking + spec tables + AI analysis
  (in whichever mode — quick or detailed — is currently selected).
- **Specs only** — ranking + spec tables, no AI call is made at all (saves
  LLM cost/time when you just need the numbers).
- **Matrix only** — just the presence matrix, no ranking/specs/AI call.

  For AC jobs, the report is scoped to whichever unit (IDU/ODU) is
  currently selected in the workspace.

## IDU/ODU scoping (AC only)

Every AC data row carries a `Unit` tag (`"IDU"` or `"ODU"`) set at upload
time. Washing machine data has no such column at all, so unit-scoping is a
safe no-op for those jobs — nothing AC-specific leaks into the washing
machine flow.

- `GET /job/{id}/assemblies` returns `assemblies_by_unit: {idu: [...],
  odu: [...]}` in addition to the flat `assemblies` list, but only for AC
  jobs.
- `presence-matrix`, `top-components`, and `report` all accept an optional
  `?unit=IDU|ODU` query param that filters the data before anything else
  runs.
- The frontend's unit toggle in `AssemblyWorkspace.jsx` drives all of this
  automatically — picking "Indoor unit" re-fetches the assembly list,
  matrix, and important-components ranking scoped to just IDU.

## API contract (actual, as implemented)

- `POST /upload` — multipart form: `files` (2–5 .xlsx), `company_names`
  (one per file), `product_type` (`"washing_machine"` | `"ac"`, defaults to
  washing machine). Returns the normalized ZIP as the response body,
  `job_id` in the `X-Job-ID` header. 400 on a bad `product_type` or a
  malformed AC file (missing IDU/ODU sheet).
- `GET /job/{job_id}` — `{ job_id, companies, product_type }`.
- `GET /job/{job_id}/assemblies?unit=` — `{ assemblies: string[],
  product_type, assemblies_by_unit? }`. `assemblies_by_unit` only present
  for AC jobs.
- `GET /job/{job_id}/presence-matrix?assembly=&unit=` — array of
  `{ Component, [companyName]: 0 | 1, ... }`.
- `GET /job/{job_id}/top-components?assembly=&top_n=&unit=` — top-N
  heaviest components present (non-NA weight) across every company, plus
  their full spec rows.
- `GET /job/{job_id}/component?name=` — single-component spec comparison +
  rule-based insights + full/detailed AI analysis.
- `POST /job/{job_id}/multi-component?analysis_mode=quick|detailed` — body
  is a raw JSON array of component names. Returns spec rows, rule-based
  insights, and an `llm_insight` whose shape depends on `analysis_mode`
  (quick → `key_points`/`verdict` per component; detailed → full
  strengths/weaknesses/suggestions per component).
- `GET /job/{job_id}/report?assembly=&top_n=&analysis_mode=&report_scope=&unit=`
  — streams a PDF. `report_scope` is `full` | `specs` | `matrix`.
- `DELETE /job/{job_id}`.

If the backend's actual response shapes ever drift from this, the only
files that need to change are `src/api/client.js` and the small mapping
logic inside the components that call it — nothing else assumes a
particular wire format beyond what `client.js` already normalizes.

## Project structure
```
#below is the backend strcuture
app/bom.py
  services/
 __init__.py
Report_pdf.py
bom_services.py
Ac_bom_services.py
llm_analysis.py

########
#belwo is the frontend structure
frontend/
src/
  api/client.js                    — axios calls matching every backend endpoint above
  components/
    FileUploadPanel.jsx             — Step 1: drag-drop upload, per-file company name, product type toggle
    NormalizationComplete.jsx       — post-upload summary + download/proceed actions
    AssemblyWorkspace.jsx           — Steps 4–5: unit toggle (AC), assembly picker, important-only
                                       filter, quick/detailed mode, bulk analysis, report download,
                                       orchestrates the matrix + grid + modal below
    PresenceMatrix.jsx              — check/x badge table
    ComponentsGrid.jsx              — card grid with coverage bars, opens the detail modal
    ComponentDetailModal.jsx        — single-component spec table + rule insights + AI insights
    AnalysisResultPanel.jsx         — shared renderer for quick/detailed/single-component/error
                                       llm_insight shapes; used by both the modal and the bulk panel
  App.jsx                           — step-wizard state machine (upload → normalizing → complete → workspace) + top nav
  index.css                         — Tailwind layers + light theme base
tailwind.config.js                  — brand red + standard slate/green/red palette, fonts
#dataset folder should be seperate not a subset of the folders above 
```


## Design notes

Light theme — white page, slate-900 text, brand red (`#DC2626`) for
primary actions and the active nav/unit/mode state, green/red for
presence and standing badges. Not a dashboard: one step fills the screen
at a time (see `App.jsx`'s step machine), cards use real borders +
shadows rather than translucent panels, and presence/coverage use visual
indicators (check/x badges, progress bars) instead of dense data tables
wherever the reference design called for it. Spec comparison tables
inside the component detail modal stay dense/monospace-adjacent on
purpose — that's the one place tabular density is still the right call.

The AI insight panel is labeled "AI insights · Engineering analysis," not
tied to a specific model name, since the backend can be pointed at
different OpenRouter models (currently `gpt-oss-20b`) without the label
becoming inaccurate.

## Known gaps / not yet done

- **No auth or persistence** — `JOB_STORE` is in-memory on the backend;
  restarting the FastAPI server loses every job. Fine for internal
  demo/single-user use, not fine for anything multi-user or long-lived.
- **No mobile layout pass** — the workspace assumes a reasonably wide
  viewport (matrix table, side-by-side toggles); nothing collapses for
  screens below ~640px yet.
- **No charts** — weight comparisons are shown as numbers/badges, not
  visualized.
- **Component detail modal always uses "detailed" depth** — there's no
  quick-mode option inside the modal itself, by design (see "Quick vs
  Detailed analysis" above), but worth knowing if a future request wants
  that changed.
- **AC dimension sub-column parsing is lightly tested** — the IDU/ODU
  pipeline was verified against synthetic data shaped to match the
  original script's own logic, not against a real IFB AC BOM file. Worth
  a real-file smoke test before trusting it fully in production.
