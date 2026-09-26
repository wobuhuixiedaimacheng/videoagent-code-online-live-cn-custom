# Audio Handling Reference

Audio is the hard floor of shot duration. Dialogue, voiceover, and inner OS
must be preserved unless the user explicitly approves adaptation.

## Audio Ledger

Build an internal ledger before shot planning:

| Field | Meaning |
| --- | --- |
| `line_id` | Source line id from parser or manual reading. |
| `scene` | Current reviewed scene or location name. |
| `speaker` | Character, narrator, or off-screen source. |
| `type` | `dialogue`, `voiceover`, or `inner_os`. |
| `content` | Original voiced content. |
| `duration_estimate` | Rounded seconds. |
| `notes` | Whisper, shout, off-screen, no-mouth, etc. |

The final prompt table does not need to show this ledger unless the user asks.

## Duration Estimation

Use rough Chinese speech estimates:

| Speech type | Rate |
| --- | --- |
| Normal dialogue | 4-5 characters/sec |
| Low voice / inner OS | 3-4 characters/sec |
| Urgent / shouting | 5-6 characters/sec |

Add pauses:

- Period or question/exclamation mark: about 1 second.
- Comma or semicolon: about 0.5 second.
- Ellipsis: about 1.5 seconds.

Formula:

```text
duration = character_count / speech_rate + pause_time
```

Round up when the line carries emotional weight.

## Hard Rules

- Every voiced line must appear exactly once in the planned prompt table.
- Shot duration must be greater than or equal to total audio duration.
- Inner OS is audio, even when the mouth does not move.
- If one audio unit is near or above 15 seconds, flag it for user revision or a
  confirmed meaning-based split.
- Do not compress dialogue just to fit a visual plan.

## Prompt Audio Format

Use concise forms:

```text
@宁鸿飞说：你终于肯见我了
@苏锦内心OS：他怎么会找到这里（不张嘴）
旁白：三年前的雨夜，又一次回到她眼前
门外传来@宁鸿飞的声音：开门
```

## Voice Details

Do not add full voice metadata to every line by default. Add only meaningful
audio direction:

- `低声说`
- `压着怒气说`
- `声音发抖`
- `隔着门传来`
- `不张嘴`

This keeps prompts shorter and avoids noise when the platform does not expose
fine-grained voice controls.
