# Prompt Formula Reference

Write prompts as executable short-drama production instructions.

## Formula

```text
[Basic image style + source-grounded time/basic lighting] + [internal shot: time range + subject + position + action + gaze/target + audio if any] + [transition anchor if needed] + [project sound strategy]
```

Example shape:

```text
二维手绘动画，雨夜，昏暗环境光；0-4秒，@苏锦站在院门内侧，左手扶着门框，目光看向门外的脚步声；4-10秒，@宁鸿飞停在门外台阶下，抬头对@苏锦说：你终于肯见我了；10-14秒，@苏锦没有回答，只把门缝推开半寸，雨声盖过两人的呼吸。电影音效，无配乐，无字幕
```

## Visual Baseline

The opening prefix controls only two things:

1. **Basic image style**: preserve the user's exact wording when supplied. When
   absent, infer it only from explicit script or reference-image evidence. If
   that evidence is insufficient, mark the style pending or ask the user.
2. **Time and basic lighting**: use literal source-grounded conditions such as
   `日间自然光`, `夜晚低照度`, `室内冷白灯光`, or `室内烛光`.

Keep this prefix short. Do not add:

- Product or distribution labels such as `游戏广告`, `买量广告`, or `短剧风格`.
- Audience or genre positioning such as `女频感`, `生存冒险`, or `爽剧感`.
- Quality or promotional claims such as `画面精美`, `高质量材质`, `大片质感`,
  or `史诗感`.
- Lighting design or atmosphere not established by the script or references.

These labels do not define a concrete renderable image property and can push
the model toward an unintended visual domain.

## Internal Shot Rules

- Use 3-5 second internal shots inside a 10-15 second storyboard when practical.
- Each internal shot should contain one clear visual event.
- Round timestamps to whole seconds.
- Connect internal shots with physical continuity, not abstract explanation.
- Keep one storyboard focused on one main interaction whenever possible.

## Timestamp Boundary Triggers

Internal-shot boundaries are not a fixed template. Treat action, reaction,
object, emotion, dialogue, and transition as optional beat labels. Split only
when the visual focus or story function changes.

First protect audio:

- Keep enough time for each spoken line, voiceover, or inner OS.
- Keep the speaker, listener, body direction, and gaze relationship clear.
- Do not insert a reaction beat if it makes the speaking relationship unclear.

Before assigning durations, scan the source beat for candidate boundaries:

- Subject shift: a new character becomes the visual focus.
- Reaction beat: a look, pause, retreat, laugh, freeze, or silence changes the
  story meaning.
- Object state: a prop changes state and carries plot information, such as a
  cup tilting, blood appearing, a door opening, or a token falling.
- Emotion turn: abstract emotion can be seen through posture, gaze, distance,
  hand movement, or loss of motion.
- Dialogue state: the clip moves from silent action to speech, from speech to
  listening, or from one speaker to another.

Use a trigger as a reminder, not an order. Do not split when the new subject is
only part of the same physical interaction, or when the detail is decorative and
does not carry story value.

After candidate boundaries are clear, assign durations inside the 10-15 second
storyboard range. Do not choose a total duration first and then compress subject
shifts or meaningful reactions into one timestamp just because they fit.

Before finalizing a prompt, ask:

- Did one timestamp contain two visual focuses that should be watched
  separately?
- Was a meaningful reaction hidden as an afterthought?
- Did an important object or emotion turn need its own beat?
- Were durations assigned after identifying beat boundaries, rather than before?

## Action Description Rules

Every important action should include:

- Subject.
- Position or spatial relationship.
- Physical action.
- Gaze, face direction, or target when relevant.
- Object or environment interaction when useful.

Prefer:

```text
@苏锦站在院门内侧，右手压着门闩，视线越过门缝看向台阶下的@宁鸿飞
```

Avoid:

```text
@苏锦很紧张地看着他
```

## Audio Annotation

Use concise audio notation:

- Dialogue: `@角色说：台词`
- Voiceover: `旁白：内容`
- Inner OS: `@角色内心OS：内容（不张嘴）`

Only add voice details when they change generation meaning:

- Whispering.
- Shouting.
- Trembling voice.
- Deliberately slow speech.
- Off-screen voice.

Do not attach full eight-dimensional voice parameters to every line unless the
target platform workflow requires it.

## Camera Language

Do not ban camera movement completely. Use it only when it carries strong
narrative intent.

Allowed examples:

- `固定镜头` for trapped confrontation or pressure.
- `镜头缓慢推近` for realization, threat, or emotional tightening.
- `镜头跟随背影` when the audience should enter the scene with a character.
- `突然给到特写` when an object or reaction changes the plot.

Avoid:

- Professional lens jargon.
- Complex crane, orbit, roll, or multi-axis camera moves.
- Camera movement added only to make the prompt look cinematic.

## Reference Asset Discipline

- Use `@` only for fixed continuity assets.
- Use exact reviewed `@` names provided by the user.
- For a required recurring asset without a reviewed reference, preserve the
  stable source name and mark it pending instead of fabricating an `@` handle.
- Keep one-moment characters, props, and ordinary scene components as concise
  inline description.
- Do not assume a scene reference image defines character blocking.
- Do not write appearance details for characters already covered by references
  unless the user asks for text-only generation.

## Density And Length

- Prefer clear and executable over ornate.
- Keep each storyboard within the model's practical duration limit.
- If a prompt becomes crowded, split only with a transition anchor.
- The prompt should be readable by a production operator, not just impressive to
  another prompt engineer.

## Project Sound Strategy

Set one sound strategy in the project config and end each prompt with that
strategy. Default:

```text
电影音效，无配乐，无字幕
```

Replace it when the user specifies a different production strategy. Do not
change dialogue, voiceover, or inner-OS preservation rules.
