import os
import json
from openai import OpenAI

llm_client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)

FOCUS_COMPANY = "IFB"

SHARED_RULES = f"""
Rules:
- {FOCUS_COMPANY} is the company being evaluated. Every other company in the
  data (Whirlpool, Haier, LG, Samsung, or whichever appear) exists only as a
  benchmark to judge {FOCUS_COMPANY} against — not as competitors you are
  ranking against each other for their own sake.

- Some fields may say "NA" — this means the data is missing, not that the
  company doesn't use that material/process. Never state a company "uses NA"
  or treat "NA" as an actual material/value. If a comparison can't be made
  because {FOCUS_COMPANY}'s data is missing, say so explicitly instead of
  guessing what {FOCUS_COMPANY} might be doing.

- Base every claim only on the numbers/text in the data below. Do not invent
  values, tolerances, performance figures, or industry standards that aren't
  supported by the provided data.

- If {FOCUS_COMPANY} is already on par with or better than every competitor
  on a given specification, state that clearly. Do not invent weaknesses or
  unnecessary improvement opportunities.

- Treat "Characteristic (eg-special point)" and "Position (Assembled where)"
  as engineering constraints rather than descriptive fields.

- Before recommending any reduction in weight, thickness, dimensions, or
  material, determine whether the Characteristic or Position indicates that
  the component performs a structural, sealing, vibration, safety, thermal,
  load-bearing, or other critical engineering function.

- Never assume that lighter, thinner, or smaller is automatically better.
  Competitor values are benchmarks, not targets.

- If the available data suggests that reducing material could compromise the
  intended function, explicitly recommend keeping the current design rather
  than optimizing it.

- If there is insufficient information to determine whether an optimization
  is safe, recommend engineering validation instead of proposing a design
  change.

- Prioritize recommendations in this order:
    1. Functional or safety improvements
    2. Material or manufacturing improvements
    3. Weight or thickness optimization

- IMPORTANT: For every weakness, compare {FOCUS_COMPANY} against ALL
  competitors in the data, not just one. If both Whirlpool and Haier show
  a different value, cite both. Use the competitor_references array to list
  every relevant competitor comparison for that weakness — never pick just
  one when multiple are relevant.

Before suggesting any design change, evaluate the component's
Characteristic (eg-special point) and Position (Assembled where).
If these fields indicate the component performs a critical structural,
supporting, sealing, vibration-control, or safety function, avoid
recommending weight or thickness reduction unless the provided data
clearly supports it.

It is acceptable—and encouraged—to recommend retaining the existing
design when it appears appropriate.

If there is insufficient information to determine whether a modification
is safe, recommend engineering validation rather than proposing a change.
""".strip()

# ---------------------------------------------------------------------------
# MODE 1: single-component, full engineering reasoning ("component")
# ---------------------------------------------------------------------------
COMPONENT_INSTRUCTIONS = f"""
You are a mechanical engineer at {FOCUS_COMPANY} evaluating one component.
Your job is to give {FOCUS_COMPANY}'s engineering team a real, reasoned
explanation — not a one-line label. For every weakness or suggestion, explain
*why* it matters: what the actual engineering or cost consequence is, not
just that a number differs. Write the way you would in an internal
engineering review, in full sentences.

Return ONLY valid JSON in this exact shape, no markdown fences, no extra text:

{{
  "ifb_standing": "<one of: \\"ahead\\", \\"on par\\", \\"behind\\", \\"unclear (insufficient data)\\">",
  "standing_explanation": "<2-4 sentences explaining WHY this standing is true, walking through the specific specs that justify it>",
  "strengths": [
    "<2-3 sentences: which spec {FOCUS_COMPANY} already matches or beats competitors on, and why that's a genuine advantage>"
  ],
  "weaknesses": [
    {{
      "issue": "<2-3 sentences: the specific gap AND the real-world consequence>",
      "competitor_references": [
        "<CompanyName: specific value — e.g. Whirlpool: 2.1mm, Haier: 1.9mm>",
        "<include one entry per competitor that shows a relevant difference — never just one if multiple apply>"
      ]
    }}
  ],
  "improvement_suggestions": [
    {{
      "change": "<concrete engineering recommendation. May be a design modification, retaining the current design, or recommending engineering validation>",
      "expected_benefit": "<2-3 sentences explaining what improves and why>",
      "cost_tradeoff": "<2-3 sentences describing manufacturing, sourcing, tooling or cost implications>",
      "risk_flag": "<one of: \\"safe to optimize\\", \\"requires engineering validation\\", \\"not recommended\\">",
      "risk_reason": "<1-2 sentences explaining how Characteristic and Position influenced this recommendation>"
    }}
  ],
  "priority": "<one of: \\"high\\", \\"medium\\", \\"low\\">",
  "priority_reasoning": "<1-2 sentences explaining why this priority level>"
}}

Every string value must be a real explanatory sentence — never a bare fragment.
If there are no strengths, weaknesses, or suggestions to report, return empty
arrays rather than inventing one.
""".strip()

# ---------------------------------------------------------------------------
# MODE 2: multi-component, full engineering reasoning ("detailed")
# (this is the old MULTI_COMPONENT_INSTRUCTIONS, unchanged in behavior —
#  used for a handful of components where a real report is wanted)
# ---------------------------------------------------------------------------
DETAILED_MULTI_INSTRUCTIONS = f"""
You are a washing machine benchmarking expert advising {FOCUS_COMPANY}'s
engineering team. You are given specs for several components, each compared
across {FOCUS_COMPANY} and its competitors. For each component, give a real,
reasoned explanation of where {FOCUS_COMPANY} stands and what to do about
it — not a one-line label. Explain the engineering or cost consequence of
each point, the way you would in an internal review, in full sentences.

Return ONLY valid JSON in this exact shape, no markdown fences, no extra text:

{{
  "overall_summary": "<3-5 sentences: across these components, where does {FOCUS_COMPANY} stand overall, what's the single highest-priority fix, and why does that one matter most>",
  "per_component": [
    {{
      "component": "<name>",
      "ifb_standing": "<one of: \\"ahead\\", \\"on par\\", \\"behind\\", \\"unclear (insufficient data)\\">",
      "standing_explanation": "<2-3 sentences explaining why, citing the specific specs>",
      "strengths": [
        "<2-3 sentences: spec where {FOCUS_COMPANY} already matches or beats competitors, and why it's a genuine advantage>"
      ],
      "weaknesses": [
        {{
          "issue": "<2-3 sentences: the specific gap AND its real-world consequence>",
          "competitor_references": [
            "<CompanyName: specific value — list every competitor that shows a relevant difference, not just one>"
          ]
        }}
      ],
      "improvement_suggestions": [
        {{
          "change": "<concrete engineering recommendation or justification for keeping the current design>",
          "expected_benefit": "<2-3 sentences explaining why>",
          "cost_tradeoff": "<2-3 sentences discussing manufacturing/cost implications>",
          "risk_flag": "<one of: \\"safe to optimize\\", \\"requires engineering validation\\", \\"not recommended\\">",
          "risk_reason": "<1-2 sentences explaining how Characteristic and Position affected this recommendation>"
        }}
      ]
    }}
  ]
}}

For every weakness, compare {FOCUS_COMPANY} against ALL competitors in the
data — not just one. Use competitor_references as an array and include one
entry per competitor that shows a relevant difference.

For every component independently evaluate Characteristic (eg-special point)
and Position (Assembled where) before making recommendations.

Do not recommend reducing weight, thickness, dimensions, or changing
materials simply because another company uses a smaller value.

Where the available data indicates a critical engineering function,
recommend maintaining the current design if appropriate.

When the available information is insufficient, recommend engineering
validation instead of inventing a design change.

Every string value must be a real explanatory sentence. Include every
component that appears in the data, even if {FOCUS_COMPANY} is already
ahead on it (just report strengths, empty weaknesses/suggestions).
""".strip()

# ---------------------------------------------------------------------------
# MODE 3: multi-component, FAST summary ("quick") — new
# ---------------------------------------------------------------------------
QUICK_INSTRUCTIONS = f"""
You are a washing machine benchmarking expert giving {FOCUS_COMPANY}'s
engineering team a FAST scan across several components — not a deep report.
The reader wants to glance at many components quickly, so be concise and
skip long justifications. No essays. Short, scannable statements only.

For each component:
- Compare {FOCUS_COMPANY} against the competitors on: Manufacturing Process,
  Material, Dimensions/Specs, Weight, and Characteristic.
- Mention ONLY the differences that actually matter — skip specs that are
  identical or trivial.
- If {FOCUS_COMPANY} is already appropriate/on par, say so in one short line
  instead of inventing a gap.
- If data is insufficient to judge, say engineering validation is needed —
  do not guess.
- Do NOT recommend reducing weight/thickness/material just because a
  competitor's number is smaller; if a genuine functional concern exists,
  say so briefly, otherwise stay neutral.

Return ONLY valid JSON in this exact shape, no markdown fences, no extra text:

{{
  "overall_summary": "<1-2 sentences max, the single biggest takeaway across all components>",
  "per_component": [
    {{
      "component": "<name>",
      "ifb_standing": "<one of: \\"ahead\\", \\"on par\\", \\"behind\\", \\"unclear (insufficient data)\\">",
      "key_points": [
        "<short bullet, ideally under 20 words, one per notable difference — e.g. 'Material: IFB uses ABS, Whirlpool/LG use PP — lower impact resistance'>",
        "<3-5 bullets max per component; omit specs with no meaningful difference>"
      ],
      "verdict": "<one short phrase: \\"appropriate as-is\\" / \\"worth investigating competitor approach\\" / \\"needs engineering validation\\" / \\"insufficient data\\">"
    }}
  ]
}}

Keep every bullet short and scannable. This is a summary view, not a report —
do not add cost_tradeoff, risk_reason, or multi-sentence explanations.
Include every component that appears in the data.
""".strip()

MODE_INSTRUCTIONS = {
    "component": COMPONENT_INSTRUCTIONS,
    "detailed": DETAILED_MULTI_INSTRUCTIONS,
    "quick": QUICK_INSTRUCTIONS,
}


def _build_prompt(data_json, mode):
    instructions = MODE_INSTRUCTIONS.get(mode, DETAILED_MULTI_INSTRUCTIONS)
    return f"{instructions}\n\n{SHARED_RULES}\n\nData:\n{data_json}"


def _attempt_truncation_repair(raw):
    stack = []
    pairs = {'{': '}', '[': ']'}
    closers = {'}': '{', ']': '['}

    for i in range(len(raw) - 1, -1, -1):
        if raw[i] not in ',}]':
            continue
        candidate = raw[: i + 1].rstrip()
        if candidate.endswith(','):
            candidate = candidate[:-1]

        open_stack = []
        ok = True
        for ch in candidate:
            if ch in pairs:
                open_stack.append(ch)
            elif ch in closers:
                if open_stack and open_stack[-1] == closers[ch]:
                    open_stack.pop()
                else:
                    ok = False
                    break
        if not ok:
            continue

        closing = ''.join(pairs[c] for c in reversed(open_stack))
        attempt = candidate + closing
        try:
            return json.loads(attempt)
        except json.JSONDecodeError:
            continue

    return None


def _parse_llm_json(raw_text):
    raw = raw_text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.lower().startswith("json"):
            raw = raw[4:].strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        repaired = _attempt_truncation_repair(raw)
        if repaired is not None:
            repaired["_truncated"] = True
            return repaired
        return {"raw_text": raw, "parse_error": True}


def _max_tokens_for(mode, num_components):
    """
    Quick mode is meant to be cheap and fast — cap it much lower per
    component than the detailed/component modes, since each component only
    needs a handful of short bullets instead of a full report.
    """
    if mode == "quick":
        # gpt-oss-20b is a reasoning model — it spends tokens on internal
        # reasoning before writing the final JSON, and that overhead doesn't
        # scale cleanly with component count, so this needs real headroom or
        # it truncates partway through the per_component list.
        return min(8000, max(1800, num_components * 700))
    # component / detailed — unchanged from original scaling
    return min(8000, max(1800, num_components * 1100))


def run_llm_analysis(df, mode="component"):
    """
    mode: "component" (single component, full report)
          "detailed"  (multiple components, full report per component)
          "quick"     (multiple components, fast scannable summary)
    """
    data_json = json.dumps(df.to_dict(orient="records"), indent=2)
    prompt = _build_prompt(data_json, mode)

    num_components = df["Component"].nunique() if "Component" in df.columns else 1
    max_tokens = _max_tokens_for(mode, num_components)

    result = _call_and_parse(prompt, max_tokens)

    # If the model ran out of room and we had to repair a truncated
    # response, retry once with a bigger budget rather than silently
    # returning a partial component list.
    if result.get("_truncated") and max_tokens < 8000:
        bumped_tokens = min(8000, max_tokens * 2)
        retry_result = _call_and_parse(prompt, bumped_tokens)
        if not retry_result.get("_truncated") and not retry_result.get("parse_error"):
            return retry_result
        # retry didn't help (or failed differently) — fall back to whatever
        # we got first, since a partial result beats nothing
        return result

    return result


def _call_and_parse(prompt, max_tokens):
    response = llm_client.chat.completions.create(
        model="openai/gpt-oss-20b:free",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=max_tokens,
    )

    choice = response.choices[0]
    raw_text = choice.message.content

    if not raw_text:
        # Reasoning models can burn the whole token budget on internal
        # reasoning and return no visible content at all. Surface that
        # clearly instead of letting .strip() crash on None downstream.
        finish_reason = getattr(choice, "finish_reason", None)
        raise ValueError(
            f"Model returned no content (finish_reason={finish_reason}). "
            "This usually means max_tokens was too low for this model's "
            "reasoning overhead — try again, or reduce the number of "
            "components in this request."
        )

    return _parse_llm_json(raw_text)