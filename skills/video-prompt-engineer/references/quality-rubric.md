# Quality Rubric Reference

Use this checklist before final output. Keep the rubric compact so it can be
used every time.

## P0 Fatal Checks

| ID | Check | Fail Condition | Fix |
| --- | --- | --- | --- |
| Q0 | Audio ledger | Any dialogue, voiceover, or inner OS is missing or duplicated. | Return to audio ledger and reassign lines. |
| Q1 | Duration | Storyboard duration is shorter than total audio duration, or one audio unit exceeds 15s without warning. | Re-split, extend, or ask user to revise audio. |
| Q2 | Asset discipline | A recurring continuity asset is missing, an `@` name is invented, or ordinary scene components are recursively extracted as assets. | Freeze the two-layer asset plan before storyboarding. |

## P1 Serious Checks

| ID | Check | Fail Condition | Fix |
| --- | --- | --- | --- |
| Q3 | Storyboard duration | Same-scene material is split into short storyboards without reason. | Merge toward 10-15s if feasible. |
| Q4 | Transition anchor | Adjacent same-space storyboards lack action, gaze, sound, object, light, or occlusion anchor. | Add a transition anchor or re-merge. |
| Q5 | Filmability | Prompt uses abstract emotion or novelistic result without physical process. | Rewrite as visible action. |
| Q6 | Blocking clarity | Dialogue scene lacks subject position, gaze, target, or body relationship. | Add concise blocking details. |
| Q7 | Prompt independence | Prompt relies on "previous", "just now", "that object", or hidden context. | Restate necessary objects and positions. |
| Q8 | Visual-focus boundary | One timestamp contains two story-relevant visual focuses, or a meaningful reaction/object change is hidden inside another beat. | Re-identify candidate boundaries, then reassign durations. |
| Q9 | Blocking and causality | A result lacks a visible cause, physical connection, compatible direction, or explicit end state. | Resolve the causal chain before rewriting the prompt. |

## P2 General Checks

| ID | Check | Fail Condition | Fix |
| --- | --- | --- | --- |
| Q10 | Density | A prompt has too many simultaneous actions or no clear main interaction. | Simplify or split with anchor. |
| Q11 | Camera restraint | Camera language is complex or decorative. | Keep only strong-intent camera motion. |
| Q12 | Output cleanliness | User-facing result includes beat summaries, full parser ledgers, or long reasoning by default. | Output only config, fixed assets, transition plan, and storyboard table. |
| Q13 | Visual baseline discipline | The prompt prefix contains inferred product, platform, audience, genre-positioning, quality-claim, or decorative atmosphere language. | Reduce it to basic image style plus source-grounded time and basic lighting. |

## Fast Pass

Before sending, ask:

- Can every voiced line be checked against the source?
- Does every same-space split have a reason to connect?
- Could this prompt be generated alone?
- Did the skill respect the user's reviewed asset names?
- Did it avoid extracting ordinary scene components and one-moment details as
  assets?
- Would a viewer understand the emotion with sound off?
- Was each duration assigned after its visual-focus boundaries were clear?
- Does each complex result have a visible cause and compatible direction?
- Does each prompt begin with only the basic image style and source-grounded
  time/basic lighting?

## Production Acceptance

Accept the output only when:

- Every source audio unit appears exactly once.
- No canonical asset name was invented or silently merged.
- Every internal shot has one primary visual focus.
- Every prompt is independently executable.
- Every same-space storyboard split has a visible or audible transition anchor.
- All remaining uncertainty is surfaced as a warning.
