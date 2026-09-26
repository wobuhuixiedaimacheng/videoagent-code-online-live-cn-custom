# Seedance 2.0-Oriented Profile

Use this profile when the user targets Seedance 2.0 or does not specify a
model for Chinese vertical short drama.

## Production Assumptions

- Target format: 9:16 vertical short drama unless user specifies otherwise.
- Treat one 10-15 second generated clip as one storyboard whenever consistency
  benefits.
- Allow several explicitly timed internal shots inside one storyboard.
- Use reviewed reference names and `@` marks provided by the user.
- Treat text prompts as production instructions, not literary prose.
- Keep outputs easy to paste into a video generation interface.

## Practical Strengths To Exploit

- Dialogue and audio-aware planning.
- Reference-driven character and scene consistency.
- Medium-length clips that hold one continuous interaction.
- Concrete physical action and visible emotional change.
- Short-drama pacing with conflict, reaction, and unresolved hooks.

## Practical Risks To Guard Against

- Character drift across separate generated clips.
- Same scene described under inconsistent names.
- Prompt overload from too many characters or simultaneous actions.
- Decorative camera movement that distracts the model.
- Voice details that bloat prompts without improving generation.

## Default Prompt Strategy

Prefer:

```text
fixed asset name + physical blocking + action + gaze/target + complete audio + transition anchor + project sound strategy
```

Avoid:

```text
automatic asset taxonomy + abstract emotion + long cinematic jargon + unexplained cross-storyboard dependency
```

## Model Profile Boundary

This skill is Seedance-first. If the user asks for Runway, Pika, Kling, or
another model, adapt only after confirming that model's reference-image,
duration, audio, and prompt-format constraints.
