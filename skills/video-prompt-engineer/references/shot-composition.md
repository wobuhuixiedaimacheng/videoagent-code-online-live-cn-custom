# Storyboard Duration And Internal Shot Reference

Use storyboard duration as a consistency tool, not merely as pacing.

Terminology:

- `Storyboard`: one Seedance generation unit, usually 10-15 seconds.
- `Internal shot`: one visual segment inside that storyboard.
- `Cut`: an editorial boundary inside or between generated material.

## Core Rule

For Seedance-oriented short drama, keep same-scene action inside 10-15 second
storyboards whenever possible. One medium-length generation is usually more
stable than several short generations stitched together.

This is especially important when:

- Characters remain in the same space.
- Character left/right positions matter.
- Props or furniture must stay consistent.
- A dialogue exchange depends on gaze and body distance.
- The camera should not reveal a spatial jump between clips.

## Internal Shots

A 10-15 second storyboard should still be rhythmically clear. Organize it into
internal shots, usually 3-5 seconds each:

| Internal shot | Function |
| --- | --- |
| Opening | Establish subject, position, conflict, or action start. |
| Middle | Carry dialogue, interaction, or physical progression. |
| Ending | Leave a visible or audible transition anchor. |

Do not force a fixed number of internal shots. Split when visual focus, emotion,
action phase, or story function changes. Do not stretch empty time.

## When To Merge

Merge internal shots into one storyboard when all are true:

- Same scene or same reviewed location.
- Same character-position relationship.
- Audio can fit inside 15 seconds.
- Actions can physically happen in one continuous moment.
- The storyboard will not overload the model with too many simultaneous events.

## When To Split

Split only when one of these is true:

- Scene or reviewed sub-location changes.
- One audio unit exceeds the model limit and needs user revision.
- Actions are physically unmergeable.
- Too many characters, props, or simultaneous actions would reduce generation
  quality.
- The cut itself carries narrative meaning.

Treat sub-10 second storyboards as exceptions, not the default.

## Transition Anchors

When splitting storyboards inside the same narrative space, assign one
transition anchor:

| Anchor | Use |
| --- | --- |
| Action continuation | Same unfinished action continues across the cut. |
| Gaze direction | A character looks toward the next subject or location. |
| Sound bridge | A voice, footstep, knock, or object sound motivates the cut. |
| Object match | The same prop appears before and after the cut. |
| Light/color match | Similar lighting hides a spatial jump. |
| Occlusion/blackout | Door, sleeve, body, curtain, or brief darkness masks the cut. |

Do not turn this into strict first-frame/end-frame control. Keep it as
lightweight editorial planning: every adjacent storyboard should have a reason
to connect.

## Spatial Continuity Checks

Before output:

- Character left/right position does not jump without a planned anchor.
- Eye lines match the intended target.
- Body orientation and distance remain plausible.
- Props used in one clip are still accounted for in the next relevant clip.
- If a scene has a reviewed reference image, still write character position and
  interaction. Reference images do not replace blocking.
