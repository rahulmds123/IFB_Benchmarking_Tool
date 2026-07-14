# BOM benchmarking dashboard — frontend

React + Tailwind dashboard for the washing machine BOM benchmarking tool. Built against the FastAPI backend's job/session endpoints (`/upload`, `/job/{job_id}/assemblies`, `/job/{job_id}/presence-matrix`, `/job/{job_id}/multi-component`).

## Setup

```bash
npm install
npm run dev
```

Runs on `http://localhost:5173` by default.

## Pointing at your backend

The API base URL defaults to `http://localhost:8000`. To point at a different host/port, create a `.env` file in the project root:

```
VITE_API_BASE_URL=http://localhost:8000
```

(or whatever host/port your FastAPI server runs on — PowerShell users running `uvicorn` locally usually don't need to change this).

## Expected backend contract

- `POST /upload` — multipart form with `files` (1–5 .xlsx) and `company_names`. Returns `job_id` in the `X-Job-ID` response header.
- `GET /job/{job_id}/assemblies` — returns a JSON array of assembly name strings.
- `GET /job/{job_id}/presence-matrix?assembly={name}` — returns an array of `{ component, presence: { [companyName]: 0 | 1 } }`.
- `POST /job/{job_id}/multi-component` — body `{ component_names: string[] }`, returns:
  ```json
  {
    "comparison": [
      {
        "component": "clutch plate",
        "rows": [
          { "company": "IFB", "material": "...", "thickness": "...", "weight": "...", "process": "..." }
        ]
      }
    ],
    "rule_insights": ["..."],
    "llm_insight": "..."
  }
  ```

If your backend's actual response shapes differ (e.g. presence keyed by array index instead of company name, or comparison rows flat instead of grouped by component), the only file that needs to change is `src/api/client.js` plus the small mapping in `src/App.jsx` — the components themselves just expect the shapes above as props.

## Project structure

```
src/
  api/client.js              — axios calls matching backend endpoints
  components/
    FileUploadPanel.jsx       — drag-drop upload + per-file company name input
    AssemblySelector.jsx      — assembly dropdown
    PresenceMatrix.jsx        — truth-table style presence grid (signature element)
    ComponentPicker.jsx       — multi-select chips, sourced from matrix components
    ComparisonTable.jsx       — grouped spec comparison, monospace, NA as muted dash
    InsightsPanel.jsx         — rule-based bullets + LLM paragraph, visually distinct
  App.jsx                     — wires state + effects to API calls
  index.css                   — Tailwind layers + base theme (dark mode only, blueprint grid bg)
tailwind.config.js            — color tokens (ink/grid/paper/signal/present/absent), fonts
```

## Design notes

Dark blueprint-navy theme (`ink-900` background) with a faint grid texture, not a generic light SaaS dashboard — see the accompanying design doc for the full rationale. Presence is shown as filled/unfilled dots (teal = present, rust = absent) rather than emoji checkmarks, and all spec data (material, thickness, weight) renders in IBM Plex Mono with right-aligned numerics so values line up across rows.

Not yet wired up (left for a follow-up pass, matches the original spec's "future enhancements"): important-component highlighting, charts, mobile tab-collapse layout below 768px.
