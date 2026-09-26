# Parser Guide

Use `scripts/parser.py` when a script is long, messy, or likely to contain
missing dialogue, ambiguous names, or mixed screenplay formats.

The parser is not a director. It does not decide final asset taxonomy. It
creates a local ledger that lets the LLM work from a compact view while keeping
source-line traceability.

The agent performs the source-wide continuity-asset pass after reading the
parser ledger and before storyboarding. Do not use parser noun counts to
recursively extract ordinary scene components.

## What It Produces

| Output | Purpose |
| --- | --- |
| `lines` | Full line-level ledger with original text, type, confidence, and line id. |
| `audio_ledger` | All dialogue, voiceover, and inner OS with estimated duration. |
| `action_ledger` | Action and environment lines preserved for shot planning. |
| `work_view` | Compact scene-grouped view suitable for LLM input. |
| `validation_report` | Unknown lines, long audio units, and naming issues. |

Do not paste the full `lines` ledger into the LLM by default. Use `work_view`
and `validation_report`; retrieve original lines only when needed.

## Basic Usage

```bash
python3 scripts/parser.py script.txt > parsed.json
```

Compact view for the LLM:

```bash
python3 scripts/parser.py script.txt --format work-view
```

Audio-only audit:

```bash
python3 scripts/parser.py script.txt --format audio-ledger
```

Line-level JSONL for local traceability:

```bash
python3 scripts/parser.py script.txt --format lines-jsonl > raw_lines.jsonl
```

## Reviewed Naming Table

If the production team has approved canonical names, pass them explicitly:

```bash
python3 scripts/parser.py script.txt --canonical-map naming.json
```

Example `naming.json`:

```json
{
  "characters": {
    "林晚": {
      "aliases": ["小林"],
      "reference": "@林晚"
    },
    "程峥": {
      "aliases": [],
      "reference": "@程峥"
    }
  },
  "scenes": {
    "澜庭酒店宴会厅入口，夜": {
      "aliases": ["宴会厅门口"],
      "reference": "@澜庭酒店宴会厅入口"
    }
  },
  "props": {
    "黑色董事邀请函": {
      "aliases": ["邀请函"],
      "reference": "@黑色董事邀请函"
    }
  }
}
```

The parser uses `aliases` for canonical-name auditing. The agent may use
`reference` values when writing prompts. See `references/input-contract.md` for
the full input schema.

If no naming table is provided, the parser preserves raw names and reports
possible ambiguity. It should not silently merge locations or props.

## When To Trust The Parser

Trust it for:

- Finding dialogue and voiced content.
- Estimating rough speech duration.
- Preserving actions and environment lines.
- Flagging unknown or suspicious lines.
- Providing source line ids for backtracking.

Do not trust it for:

- Final scene taxonomy.
- Character identity resolution across aliases.
- Prop canonicalization.
- Fixed-asset decisions.
- Director decisions.
- Shot splitting without LLM/human review.

## Recommended Workflow

1. Run parser on the script.
2. Inspect `validation_report`.
3. If naming issues matter, ask the user for a reviewed naming table.
4. Use `work_view` for prompt planning.
5. Use `line_id` to retrieve exact source lines when a shot has ambiguity.
