from fastapi import FastAPI, UploadFile, File, Form
from typing import List
from fastapi.responses import StreamingResponse, JSONResponse
import pandas as pd
import io
from fastapi.middleware.cors import CORSMiddleware
from app.services.bom_services import get_top_weighted_components
from app.services.llm_analysis import run_llm_analysis
from app.services.Report_pdf import build_bom_report_pdf
from app.services.Ac_bom_services import process_ac_files_api
from app.services.bom_services import (
    process_files_api, JOB_STORE,
    get_presence_matrix, get_assembly_data, filter_by_unit,
    compare_component_specs, highlight_differences,
    analyze_multiple_components
)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Job-ID"],
)


@app.get("/")
def root():
    return {"message": "API is running"}


@app.post("/upload", summary="Upload BOM Excel files")
async def upload_files(
    files: List[UploadFile] = File(...),
    company_names: List[str] = Form(...),  # e.g. ["IFB", "Whirlpool", "Haier"]
    product_type: str = Form("washing_machine"),  # "washing_machine" | "ac"
):
    if product_type not in ("washing_machine", "ac"):
        return JSONResponse(
            status_code=400,
            content={"error": "product_type must be 'washing_machine' or 'ac'"},
        )

    file_bytes_dict = {}
    for file in files:
        content = await file.read()
        file_bytes_dict[file.filename] = content

    try:
        if product_type == "ac":
            job_id, zip_buffer = process_ac_files_api(file_bytes_dict, company_names)
        else:
            job_id, zip_buffer = process_files_api(file_bytes_dict, company_names)
    except ValueError as e:
        # e.g. AC file missing an IDU/ODU sheet, or Assembly Area column
        # not found — these are data problems with the uploaded file, not
        # server errors, so surface the real message instead of a 500.
        return JSONResponse(status_code=400, content={"error": str(e)})

    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": "attachment; filename=normalized_files.zip",
            "X-Job-ID": job_id
        }
    )


@app.get("/job/{job_id}")
def get_job(job_id: str):
    if job_id not in JOB_STORE:
        return JSONResponse(status_code=404, content={"error": "Job not found"})
    companies = list(JOB_STORE[job_id]["normalized"].keys())
    return {
        "job_id": job_id,
        "companies": companies,
        "product_type": JOB_STORE[job_id].get("product_type", "washing_machine"),
    }


@app.get("/job/{job_id}/assemblies")
def get_assemblies(job_id: str, unit: str = None):
    if job_id not in JOB_STORE:
        return JSONResponse(status_code=404, content={"error": "Job not found"})
    data = JOB_STORE[job_id]["normalized"]
    product_type = JOB_STORE[job_id].get("product_type", "washing_machine")

    scoped = filter_by_unit(data, unit) if unit else data
    assemblies = set()
    for df in scoped.values():
        assemblies.update(df["Assembly Area"].dropna().unique())

    result = {"assemblies": sorted(assemblies), "product_type": product_type}

    if product_type == "ac":
        # Also return the full IDU/ODU split so the frontend can build a
        # unit toggle without extra round trips — this is independent of
        # whatever `unit` filter was passed above.
        idu_assemblies = set()
        for df in filter_by_unit(data, "IDU").values():
            idu_assemblies.update(df["Assembly Area"].dropna().unique())
        odu_assemblies = set()
        for df in filter_by_unit(data, "ODU").values():
            odu_assemblies.update(df["Assembly Area"].dropna().unique())
        result["assemblies_by_unit"] = {
            "idu": sorted(idu_assemblies),
            "odu": sorted(odu_assemblies),
        }

    return result


@app.get("/job/{job_id}/top-components", summary="Top 5 heaviest components present across all companies, for an assembly")
def top_components(job_id: str, assembly: str, top_n: int = 5, unit: str = None):
    if job_id not in JOB_STORE:
        return JSONResponse(status_code=404, content={"error": "Job not found"})

    data = JOB_STORE[job_id]["normalized"]
    spec_cols = JOB_STORE[job_id].get("analysis_spec_cols")
    data = filter_by_unit(data, unit)
    assembly_data = get_assembly_data(data, assembly)

    ranked = get_top_weighted_components(assembly_data, top_n=top_n)

    if not ranked:
        return {
            "assembly": assembly,
            "components": [],
            "specs": [],
            "message": "No component has valid weight data present across every company for this assembly.",
        }

    component_names = [c["component"] for c in ranked]

    all_dfs = []
    for comp in component_names:
        df = compare_component_specs(data, comp, spec_cols=spec_cols)
        df["Component"] = comp
        all_dfs.append(df)

    specs_df = pd.concat(all_dfs, ignore_index=True).fillna("NA")

    return {
        "assembly": assembly,
        "components": ranked,
        "specs": specs_df.to_dict(orient="records"),
    }


@app.get(
    "/job/{job_id}/report",
    summary="Download a PDF report: full, specs-only, or presence-matrix-only",
)
def download_report(
    job_id: str,
    assembly: str,
    top_n: int = 5,
    analysis_mode: str = "quick",
    report_scope: str = "full",  # "full" | "specs" | "matrix"
    unit: str = None,  # "IDU" | "ODU" — AC jobs only, no-op for washing machine
):
    if job_id not in JOB_STORE:
        return JSONResponse(status_code=404, content={"error": "Job not found"})

    if analysis_mode not in ("quick", "detailed"):
        return JSONResponse(
            status_code=400,
            content={"error": "analysis_mode must be 'quick' or 'detailed'"},
        )
    if report_scope not in ("full", "specs", "matrix"):
        return JSONResponse(
            status_code=400,
            content={"error": "report_scope must be 'full', 'specs', or 'matrix'"},
        )

    data = JOB_STORE[job_id]["normalized"]
    spec_cols = JOB_STORE[job_id].get("analysis_spec_cols")
    data = filter_by_unit(data, unit)
    assembly_data = get_assembly_data(data, assembly)

    presence_rows = None
    ranked = None
    component_names = []
    multi_df = None
    llm_insight = None

    # "matrix" and "full" both need the presence matrix; "specs" doesn't.
    if report_scope in ("full", "matrix"):
        presence_matrix_df = get_presence_matrix(assembly_data, spec_cols=spec_cols)
        presence_rows = (
            presence_matrix_df.reset_index().rename(columns={"index": "Component"}).to_dict(orient="records")
        )

    # "specs" and "full" both need the top-N ranking + spec rows; "matrix"
    # doesn't — no point computing weight rankings for a matrix-only report.
    if report_scope in ("full", "specs"):
        ranked = get_top_weighted_components(assembly_data, top_n=top_n)
        if not ranked:
            return JSONResponse(
                status_code=400,
                content={
                    "error": "No component has valid weight data present across every company "
                             "for this assembly — nothing to build a report from."
                },
            )
        component_names = [c["component"] for c in ranked]

        all_dfs = []
        for comp in component_names:
            df = compare_component_specs(data, comp, spec_cols=spec_cols)
            df["Component"] = comp
            all_dfs.append(df)
        multi_df = pd.concat(all_dfs, ignore_index=True).fillna("NA")

    # Only the "full" scope actually needs the LLM — this is where the
    # token/cost savings happen for specs-only and matrix-only downloads.
    if report_scope == "full":
        llm_mode = "quick" if analysis_mode == "quick" else ("component" if len(component_names) == 1 else "detailed")
        try:
            llm_insight = run_llm_analysis(multi_df, mode=llm_mode)
        except Exception as e:
            llm_insight = {"error": str(e)}

    if report_scope == "matrix" and not presence_rows:
        return JSONResponse(
            status_code=400,
            content={"error": "No presence data found for this assembly."},
        )

    pdf_bytes = build_bom_report_pdf(
        assembly=assembly,
        analysis_mode=analysis_mode,
        presence_rows=presence_rows,
        ranking=ranked,
        specs_rows=multi_df.to_dict(orient="records") if multi_df is not None else None,
        llm_insight=llm_insight,
        component_names=component_names or None,
    )

    safe_name = assembly.replace(" ", "_").replace("/", "-")
    filename = f"{safe_name}_{report_scope}_report.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/job/{job_id}/presence-matrix")
def presence_matrix(job_id: str, assembly: str = None, unit: str = None):
    if job_id not in JOB_STORE:
        return JSONResponse(status_code=404, content={"error": "Job not found"})

    data = JOB_STORE[job_id]["normalized"]
    spec_cols = JOB_STORE[job_id].get("analysis_spec_cols")
    data = filter_by_unit(data, unit)

    if assembly:
        data = get_assembly_data(data, assembly)

    matrix = get_presence_matrix(data, spec_cols=spec_cols)
    return matrix.reset_index().rename(columns={"index": "Component"}).to_dict(orient="records")


@app.get("/job/{job_id}/component", summary="Single component comparison + insights (always full detailed report)")
def component_analysis(job_id: str, name: str):
    if job_id not in JOB_STORE:
        return JSONResponse(status_code=404, content={"error": "Job not found"})

    data = JOB_STORE[job_id]["normalized"]
    spec_cols = JOB_STORE[job_id].get("analysis_spec_cols")
    df = compare_component_specs(data, name, spec_cols=spec_cols)

    rule_insights = highlight_differences(df)

    try:
        llm_insight = run_llm_analysis(df, mode="component")
    except Exception as e:
        llm_insight = {"error": str(e)}

    return {
        "component": name,
        "specs": df.to_dict(orient="records"),
        "rule_insights": rule_insights,
        "llm_insight": llm_insight,
        "analysis_mode": "detailed",
    }


@app.post("/job/{job_id}/multi-component", summary="Multi-component comparison + insights")
def multi_component_analysis(
    job_id: str,
    component_names: List[str],
    analysis_mode: str = "detailed",  # "quick" or "detailed", set by the frontend toggle
):
    if job_id not in JOB_STORE:
        return JSONResponse(status_code=404, content={"error": "Job not found"})

    if analysis_mode not in ("quick", "detailed"):
        return JSONResponse(
            status_code=400,
            content={"error": "analysis_mode must be 'quick' or 'detailed'"},
        )

    data = JOB_STORE[job_id]["normalized"]
    spec_cols = JOB_STORE[job_id].get("analysis_spec_cols")

    all_dfs = []
    for comp in component_names:
        df = compare_component_specs(data, comp, spec_cols=spec_cols)
        df["Component"] = comp
        all_dfs.append(df)

    multi_df = pd.concat(all_dfs, ignore_index=True).fillna("NA")
    rule_insights = analyze_multiple_components(multi_df)

    # Mode resolution:
    # - "quick" requested -> always run the fast summary prompt, regardless of count
    # - "detailed" requested with exactly one component -> reuse the single-component
    #   full report prompt (it's the same depth, just a cleaner schema)
    # - "detailed" requested with multiple components -> full per-component report
    if analysis_mode == "quick":
        llm_mode = "quick"
    else:
        llm_mode = "component" if len(component_names) == 1 else "detailed"

    try:
        llm_insight = run_llm_analysis(multi_df, mode=llm_mode)
    except Exception as e:
        llm_insight = {"error": str(e)}

    return {
        "components": component_names,
        "specs": multi_df.to_dict(orient="records"),
        "insights": rule_insights,
        "llm_insight": llm_insight,
        "analysis_mode": analysis_mode,
    }


@app.delete("/job/{job_id}")
def delete_job(job_id: str):
    if job_id not in JOB_STORE:
        return JSONResponse(status_code=404, content={"error": "Job not found"})
    del JOB_STORE[job_id]
    return {"message": "Job deleted"}