# Input Contract

Use this reference when inputs are incomplete, asset names are inconsistent, or
the user asks how to prepare material for the skill.

## Minimum Input

The skill requires:

1. A script, novel excerpt, or source text that can be traced line by line.
2. A request to convert the source into AI-video shot prompts.

Use these defaults when the user does not specify them:

- Aspect ratio: `9:16`
- Model profile: Seedance-oriented
- Style: infer one concise phrase from the source and apply it consistently
- Sound strategy: `电影音效，无配乐，无字幕`

## Recommended Production Input

| Field | Required | Rule |
| --- | --- | --- |
| Source text | Yes | Preserve all voiced content and plot facts. |
| Target model | No | Default to Seedance-oriented rules. Confirm other model limits before adapting. |
| Aspect ratio | No | Default to 9:16. |
| Reviewed character names | Recommended | Use exact canonical names and `@` references supplied by the user. Identify additional recurring characters before storyboarding. |
| Reviewed scene names | Recommended | Keep small locations separate unless the user has merged them. Treat ordinary environmental elements as part of the scene. |
| Reviewed prop names | Recommended | Preserve plot-bearing object names and states. Do not extract one-moment props as fixed assets. |
| Style | No | Use one short, production-relevant phrase. |
| Sound strategy | No | Set once at project level and append consistently unless a storyboard has an explicit exception. |
| Immutable dialogue | No | Treat marked lines as verbatim audio constraints. |
| Required story beats | No | Preserve them without inventing connecting plot. |

## Reviewed Asset Map

The local parser accepts an optional JSON naming map:

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
    "澜庭酒店宴会厅入口": {
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

The parser uses `aliases` for canonical-name auditing. The agent uses
`reference` values when writing prompts. Do not invent missing `@` references.

This map does not need to include every visible element. Include fixed
continuity assets only. Keep one-moment characters, props, and environmental
details as plain prompt text.

## Accepted Source Formats

- Direct Agent input: any format the host can read reliably.
- Local parser input: UTF-8 plain text.
- PDF, DOCX, image, and OCR material: extract and verify the text before running
  the parser.

Preserve line order and speaker labels during extraction. If extraction is
uncertain, retain the raw line and flag it instead of silently rewriting it.

## Missing Or Conflicting Input

- No asset map: preserve raw names and list important ambiguity.
- Required recurring asset without a reference: keep its stable source name,
  mark it as pending, and do not fabricate an `@` handle.
- Conflicting aliases: stop automatic canonicalization and ask for a reviewed
  naming decision.
- Outline instead of finalized source: request a finalized script or route to a
  script-writing workflow before storyboarding.
- Unknown model: use the Seedance-oriented profile only when the user accepts
  it; otherwise confirm duration, reference, audio, and prompt-format limits.
- Audio unit over 15 seconds: flag it for revision or request permission to split
  it by meaning.
- Contradictory story facts: surface the conflict before producing final prompts.

## Example Invocation

```text
Use video-prompt-engineer to convert @script.txt into Seedance 2.0 short-drama
shot prompts. Use 9:16, keep every line verbatim, and use only the reviewed
names in @assets.json.
```

For a complete input and output pair, read:

- `examples/urban-reveal/script.txt`
- `examples/urban-reveal/assets.json`
- `examples/urban-reveal/expected-output.md`
