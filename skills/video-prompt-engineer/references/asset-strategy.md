# Continuity Asset Strategy

Use this reference before storyboard planning. The goal is to fix only the
characters, scenes, and independent props whose identity must survive across
separate generations.

## Two-Layer Rule

### Fixed Assets

Treat an element as a fixed asset when any condition is true:

- The user already supplied or explicitly requested a reference asset.
- It repeats across separated story moments.
- Its expected visual span exceeds one 15-second storyboard.
- It disappears and later returns.
- Its identity or state must remain recognizable across separate generations.

Use the exact reviewed `@` name when available. If the source uses one stable
name but no reference exists yet, list it as a pending fixed asset. If names are
ambiguous, request a naming decision instead of inventing taxonomy.

### Inline Elements

Everything else stays inside the relevant prompt as a short description:

- A character, scene, or prop used only in one short continuous moment.
- Temporary action details such as a rope loop, loose cargo, flying splinters,
  or a passing background figure.
- Environmental texture that does not carry independent identity.

Do not assign these elements `@` names or produce a separate asset list for
them.

## Scene Absorption

A fixed scene owns its ordinary environmental composition. Do not recursively
extract every visible noun.

Example:

```text
@远古木船甲板
```

may already contain planks, railings, rigging, barrels, masts, and background
ropes. Those elements remain scene details unless the script turns one into an
independent plot-bearing prop.

A prop becomes independent when a character acts on it, its state carries
story information, or its identity must continue beyond the current short
moment. Mere repeated visibility inside the same scene is not sufficient.

## One-Pass Workflow

1. Read the full finalized source.
2. Build a minimal chronology using scenes, actions, and audio duration.
3. Identify repeated, over-15-second, or non-contiguous characters, scenes, and
   independent props.
4. Freeze the fixed-asset plan.
5. Write the first storyboard pass using those names.

Do not generate storyboards first, extract assets from them, and rewrite the
same storyboards.

## Output Shape

Keep the user-facing plan compact:

| Asset | Type | Reference status | Reason |
| --- | --- | --- | --- |
| `@男主` | Character | Confirmed | Appears across storyboards |
| `远古木船甲板` | Scene | Pending | Action remains in the same space beyond 15 seconds |

Do not list inline elements in this table.
