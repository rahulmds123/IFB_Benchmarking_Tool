"""
Generates a single PDF report combining:
  1. Presence matrix for the selected assembly
  2. Top-N heaviest components ranking
  3. Spec comparison table for those components
  4. LLM analysis (quick or detailed shape) for those components

Used by GET /job/{job_id}/report in main.py. Does not know about FastAPI or
JOB_STORE at all — it just takes plain data structures (the same shapes the
other endpoints already return) and returns PDF bytes.
"""

import io
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    PageBreak,
    KeepTogether,
)

FOCUS_COMPANY = "IFB"

INK = colors.HexColor("#1a2332")
ACCENT_TEAL = colors.HexColor("#0f766e")
ACCENT_AMBER = colors.HexColor("#b45309")
ACCENT_RUST = colors.HexColor("#9f1d1d")
GRID = colors.HexColor("#d8dce3")
MUTED = colors.HexColor("#5b6472")


def _styles():
    base = getSampleStyleSheet()
    styles = {
        "title": ParagraphStyle(
            "ReportTitle", parent=base["Title"], fontSize=18, textColor=INK, spaceAfter=2,
        ),
        "subtitle": ParagraphStyle(
            "ReportSubtitle", parent=base["Normal"], fontSize=10, textColor=MUTED, spaceAfter=14,
        ),
        "section": ParagraphStyle(
            "SectionHeading", parent=base["Heading2"], fontSize=13, textColor=INK,
            spaceBefore=16, spaceAfter=8, borderPadding=0,
        ),
        "component_name": ParagraphStyle(
            "ComponentName", parent=base["Heading3"], fontSize=11.5, textColor=ACCENT_TEAL,
            spaceBefore=10, spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "Body", parent=base["Normal"], fontSize=9, leading=12.5, textColor=INK,
            alignment=TA_LEFT,
        ),
        "cell": ParagraphStyle(
            "Cell", parent=base["Normal"], fontSize=8, leading=10.5, textColor=INK,
        ),
        "cell_muted": ParagraphStyle(
            "CellMuted", parent=base["Normal"], fontSize=8, leading=10.5, textColor=MUTED,
        ),
        "label": ParagraphStyle(
            "Label", parent=base["Normal"], fontSize=7.5, textColor=MUTED,
            spaceBefore=6, spaceAfter=2,
        ),
        "bullet": ParagraphStyle(
            "Bullet", parent=base["Normal"], fontSize=9, leading=12.5, textColor=INK,
            leftIndent=10, spaceAfter=3,
        ),
        "footnote": ParagraphStyle(
            "Footnote", parent=base["Normal"], fontSize=7.5, textColor=MUTED,
        ),
    }
    return styles


def _is_na(v):
    return v is None or str(v).strip().lower() in ("", "na", "n/a", "nan", "-", "--")


def _standing_hex(standing):
    return {
        "ahead": "#0f766e",
        "on par": "#b45309",
        "behind": "#9f1d1d",
    }.get(standing, "#5b6472")


# ---------------------------------------------------------------------------
# Section builders — each returns a list of flowables
# ---------------------------------------------------------------------------

def _header(assembly, analysis_mode, styles):
    generated = datetime.now().strftime("%d %b %Y, %H:%M")
    mode_label = "Quick" if analysis_mode == "quick" else "Detailed"
    flow = [
        Paragraph("BOM Benchmarking Report", styles["title"]),
        Paragraph(
            f"Assembly: {assembly}  &nbsp;|&nbsp;  Analysis mode: {mode_label}  &nbsp;|&nbsp;  "
            f"Generated {generated}  &nbsp;|&nbsp;  Focus company: {FOCUS_COMPANY}",
            styles["subtitle"],
        ),
    ]
    return flow


def _presence_matrix_section(presence_rows, companies, styles):
    if not presence_rows:
        return []

    flow = [Paragraph("Presence Matrix", styles["section"])]

    header = ["Component"] + companies
    data = [header]
    for row in presence_rows:
        line = [Paragraph(str(row.get("Component", "")), styles["cell"])]
        for company in companies:
            present = row.get(company)
            mark = "Present" if present in (1, True, "1") else "Missing"
            style = styles["cell"] if present in (1, True, "1") else styles["cell_muted"]
            line.append(Paragraph(mark, style))
        data.append(line)

    col_widths = [55 * mm] + [(160 - 55) / max(len(companies), 1) * mm for _ in companies]
    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, GRID),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f6f8")]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    flow.append(table)
    return flow


def _ranking_section(ranking, styles):
    if not ranking:
        return []

    flow = [Paragraph("Top Components by Weight", styles["section"])]
    companies = sorted({c for r in ranking for c in r.get("weights_by_company", {})})

    header = ["#", "Component", "Avg weight (g)"] + [f"{c} (g)" for c in companies]
    data = [header]
    for i, r in enumerate(ranking, start=1):
        weights = r.get("weights_by_company", {})
        row = [
            str(i),
            Paragraph(str(r.get("component", "")), styles["cell"]),
            f"{r.get('avg_weight', ''):.1f}" if isinstance(r.get("avg_weight"), (int, float)) else "-",
        ]
        for c in companies:
            v = weights.get(c)
            row.append(f"{v:.1f}" if isinstance(v, (int, float)) else "-")
        data.append(row)

    n_extra_cols = len(companies)
    col_widths = [10 * mm, 45 * mm, 28 * mm] + [(160 - 83) / max(n_extra_cols, 1) * mm for _ in companies]
    table = Table(data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.5, GRID),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f6f8")]),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    flow.append(table)
    return flow


def _specs_section(specs_rows, styles):
    if not specs_rows:
        return []

    flow = [Paragraph("Component Specifications", styles["section"])]

    # group rows by Component, preserving first-seen order
    grouped = {}
    for row in specs_rows:
        comp = row.get("Component", "")
        grouped.setdefault(comp, []).append(row)

    spec_cols = [
        k for k in (specs_rows[0].keys() if specs_rows else [])
        if k not in ("Company", "Component")
    ]

    for comp, rows in grouped.items():
        block = [Paragraph(comp, styles["component_name"])]
        header = ["Company"] + spec_cols
        data = [header]
        for row in rows:
            line = [Paragraph(str(row.get("Company", "")), styles["cell"])]
            for col in spec_cols:
                val = row.get(col)
                style = styles["cell_muted"] if _is_na(val) else styles["cell"]
                line.append(Paragraph("—" if _is_na(val) else str(val), style))
            data.append(line)

        col_widths = [28 * mm] + [(170 - 28) / max(len(spec_cols), 1) * mm for _ in spec_cols]
        table = Table(data, colWidths=col_widths, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eef0f3")),
            ("TEXTCOLOR", (0, 0), (-1, 0), INK),
            ("FONTSIZE", (0, 0), (-1, -1), 7.5),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, GRID),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        block.append(table)
        flow.append(KeepTogether(block))

    return flow


def _normalize_llm_insight(llm_insight, component_names):
    """
    Returns (overall_summary_or_None, list_of_per_component_dicts, error_or_None).
    Handles all three shapes run_llm_analysis can produce: "component" (flat,
    single item), "detailed"/"quick" (per_component list), or an error/parse
    failure dict.
    """
    if not isinstance(llm_insight, dict):
        return None, [], "No analysis available."

    if llm_insight.get("error"):
        return None, [], f"LLM analysis unavailable ({llm_insight['error']})."

    if llm_insight.get("parse_error"):
        return None, [], "LLM response could not be parsed."

    if "per_component" in llm_insight:
        return llm_insight.get("overall_summary"), llm_insight.get("per_component", []), None

    if "ifb_standing" in llm_insight:
        item = dict(llm_insight)
        item.setdefault("component", component_names[0] if component_names else "")
        return None, [item], None

    return None, [], "LLM response was in an unrecognized format."


def _llm_component_block(item, styles):
    flow = [Paragraph(item.get("component", ""), styles["component_name"])]

    standing = item.get("ifb_standing")
    if standing:
        flow.append(Paragraph(
            f'<font color="{_standing_hex(standing)}"><b>{standing.upper()}</b></font>',
            styles["body"],
        ))

    # Quick-mode shape: key_points + verdict
    if "key_points" in item:
        if item.get("verdict"):
            flow.append(Paragraph(f"<i>{item['verdict']}</i>", styles["body"]))
        for point in item.get("key_points", []):
            flow.append(Paragraph(f"&bull; {point}", styles["bullet"]))
        return flow

    # Detailed/component-mode shape
    if item.get("standing_explanation"):
        flow.append(Paragraph(item["standing_explanation"], styles["body"]))

    if item.get("strengths"):
        flow.append(Paragraph("Strengths", styles["label"]))
        for s in item["strengths"]:
            flow.append(Paragraph(f"+ {s}", styles["bullet"]))

    if item.get("weaknesses"):
        flow.append(Paragraph("Weaknesses", styles["label"]))
        for w in item["weaknesses"]:
            issue = w.get("issue", "")
            refs = w.get("competitor_references") or []
            flow.append(Paragraph(f"&bull; {issue}", styles["bullet"]))
            if refs:
                flow.append(Paragraph(
                    "vs " + "; ".join(refs), styles["footnote"]
                ))

    if item.get("improvement_suggestions"):
        flow.append(Paragraph("Suggestions", styles["label"]))
        for s in item["improvement_suggestions"]:
            change = s.get("change", "")
            risk = s.get("risk_flag")
            line = f"&rarr; {change}"
            if risk:
                line += f"  <i>[{risk}]</i>"
            flow.append(Paragraph(line, styles["bullet"]))
            if s.get("expected_benefit"):
                flow.append(Paragraph(f"benefit: {s['expected_benefit']}", styles["footnote"]))
            if s.get("cost_tradeoff"):
                flow.append(Paragraph(f"cost: {s['cost_tradeoff']}", styles["footnote"]))

    if item.get("priority"):
        flow.append(Paragraph(f"Priority: {item['priority']}", styles["footnote"]))

    return flow


def _llm_section(llm_insight, component_names, analysis_mode, styles):
    mode_label = "Quick Analysis" if analysis_mode == "quick" else "Detailed Analysis"
    flow = [Paragraph(f"LLM Insight — {mode_label}", styles["section"])]

    overall_summary, per_component, error_msg = _normalize_llm_insight(llm_insight, component_names)

    if error_msg:
        flow.append(Paragraph(error_msg, styles["footnote"]))
        return flow

    if overall_summary:
        flow.append(Paragraph(overall_summary, styles["body"]))

    if isinstance(llm_insight, dict) and llm_insight.get("_truncated"):
        flow.append(Paragraph(
            f"Note: response was cut short by the model — showing {len(per_component)} "
            f"of {len(component_names)} requested components.",
            styles["footnote"],
        ))

    for item in per_component:
        flow.append(KeepTogether(_llm_component_block(item, styles)))

    return flow


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def build_bom_report_pdf(
    assembly,
    analysis_mode,
    presence_rows=None,
    ranking=None,
    specs_rows=None,
    llm_insight=None,
    component_names=None,
):
    """
    All args are the same plain dict/list shapes the existing FastAPI
    endpoints already return — no FastAPI or pandas objects here.

    Every data argument is optional — pass None (or omit) to skip that
    section of the report entirely, e.g. for a "matrix only" or
    "specs only" download. Sections that are included get separated by
    a page break; sections that are skipped don't leave a blank page.

    presence_rows: [{"Component": "drum", "IFB": 1, "Whirlpool": 0, ...}, ...]
                   -> include for the presence matrix section
    ranking:       [{"component": "drum", "avg_weight": 86.5,
                      "weights_by_company": {"IFB": 90, ...}}, ...]
                   -> include (alongside specs_rows) for the ranking + specs
                      section
    specs_rows:    [{"Company": "IFB", "Component": "drum", "Material": "...", ...}, ...]
    llm_insight:   whatever run_llm_analysis() returned — include for the
                   LLM insight section. Omit entirely (leave as None) for a
                   "specs only" or "matrix only" report; the caller should
                   skip calling run_llm_analysis() in that case too, so no
                   LLM cost is incurred for a report that won't show it.
    analysis_mode: "quick" | "detailed" — only used for the LLM section's
                   heading; harmless to pass even if llm_insight is None.
    component_names: optional explicit list; derived from ranking if omitted

    Returns raw PDF bytes.
    """
    styles = _styles()
    companies = [k for k in (presence_rows[0].keys() if presence_rows else []) if k != "Component"]
    component_names = component_names or [r["component"] for r in (ranking or [])]

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=18 * mm,
        bottomMargin=16 * mm,
        leftMargin=16 * mm,
        rightMargin=16 * mm,
        title=f"{assembly} BOM Benchmarking Report",
    )

    # Build each optional section independently, then only insert page
    # breaks between sections that actually exist — otherwise a
    # "matrix only" report would still carry two blank trailing pages.
    sections = []

    if presence_rows:
        block = list(_presence_matrix_section(presence_rows, companies, styles))
        if ranking:
            block.append(Spacer(1, 6))
            block += _ranking_section(ranking, styles)
        sections.append(block)
    elif ranking:
        # ranking without a presence matrix (shouldn't normally happen given
        # how the endpoint calls this, but handled so the function is safe
        # to call directly with any combination of arguments)
        sections.append(list(_ranking_section(ranking, styles)))

    if specs_rows:
        sections.append(list(_specs_section(specs_rows, styles)))

    if llm_insight is not None:
        sections.append(list(_llm_section(llm_insight, component_names, analysis_mode, styles)))

    story = _header(assembly, analysis_mode, styles)
    for i, block in enumerate(sections):
        if i > 0:
            story.append(PageBreak())
        story += block

    if not sections:
        story.append(Paragraph("No data was available for this report.", styles["body"]))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()