# Web crawler reference study

This revision is based primarily on the user's 8.58-second screen recording, rather than a generic spider animation. The recording is 736 × 512 pixels; the central artwork occupies roughly 264 pixels of its width. We inspected 34 samples spaced a quarter-second apart, plus enlarged body/leg crops. Times below are approximate sample positions.

The source credit visible in the recording is **everything.bends**. Its caption identifies a real-time TouchDesigner work and starts naming VCV Rack. Searches for that handle, the caption, and the artwork did not expose the original project or a readable creator explanation. The primary TikTok profile could not be retrieved. This study therefore separates visible behavior from implementation choices; it does not claim access to the creator's patch or word-selection algorithm.

## What the frames show

| Part | Observation in the supplied recording | Revision |
| --- | --- | --- |
| Body | A narrow black, segmented silhouette, roughly 11–13 pixels wide and 25–30 pixels tall at the recording's scale. It is smaller than the leg fan. | Three angular body sections and small spinnerets; removed the broad rectangular eye/body treatment. |
| Legs | Eight distinct limbs with heavier proximal sections, thin tips, sharp elbows, and bright pink markers. The joints do not all swing together. | Independent two-segment leg chains; tapered black geometry and pink shoulder/knee/contact markers. |
| Contact | Across adjacent frames, some feet retain their contact while other legs lift/reach/replant. The body can move while feet hold the page. | Toes are persistent document-space positions, not positions regenerated every draw. At most three legs lift together; the rest retain their planted contacts. |
| Travel | Short sideways moves and pauses, with small changes of body angle. There is no continuous sinusoidal wobble driving every joint. | Damped body motion, stable bend directions, staggered foot lifts with short swing arcs, and dwell periods between targets. |
| Height | The body remains near a consistent viewport height while comments pass upward. A rough dark-body tracking window stayed within about ten vertical pixels across most sampled frames. | Body position is compensated for viewport scrolling. The feet remain attached to document coordinates, so scrolling creates a need to replant. |
| Text | Compact sans-serif comment text on a pale grey field, with a much higher text density than the first version's large serif prose. | Compact sans-serif passages, abstract grey source markers, and a quiet grey/lilac field. |
| Targeting | It does not highlight every connecting word in order. Several words/phrases are circled at once; grey circles can surround neutral terms. | Default word/phrase hunting skips common function words and chooses sparse content targets. A separate every-word mode remains available. |
| Callouts | Around 1–2 seconds, a pink callout persists while the crawler moves onward. Around 3–4 seconds, a purple callout and word ellipse are visible. Around 5–7 seconds, pink and purple callouts coexist with long fine connector lines. | Multiple persistent word/phrase ellipses, thin connectors, outlined neon pink/purple labels, and a small cyan crawler tag. Labels follow their source text as it scrolls. |

## Limits of the reconstruction

Skipping words is visible, but it does not establish that the original understands semantic context. The current implementation ranks document topics and nearby phrases using local English token filtering, term co-occurrence, repeated concepts, and sentence coverage. Positive and negative vocabulary receives no ranking bonus. Cyan labels give neutral ideas equal visibility; pink/purple still mark recognized tone. It is not an AI model or a reconstruction of the creator's unknown classifier. The LOVE/HATE counters report recognized terms actually visited by this implementation.

The reference is a brief, compressed recording. Exact hidden leg parameters, complete target timing, unrecorded behavior, and the original synth patch cannot be recovered from it. No original source code, footage, or sound is bundled with the site.

## Technical sources consulted

- [TouchDesigner Inverse Kin CHOP documentation](https://docs.derivative.ca/Inverse_Kin_CHOP): end-effector targets and continuity of a bone chain. This supports using stable joint constraints; it is not evidence that this specific artwork uses that operator.
- [TouchDesigner Spring CHOP documentation](https://docs.derivative.ca/Spring_CHOP): spring/mass response and damping. This informed the choice to give the body a damped response instead of perpetual oscillation.
- [Ryan Juckett: Analytic Two-Bone IK in 2D](https://www.ryanjuckett.com/analytic-two-bone-ik-in-2d/): reach limits and bend-side choices. The site's solver is an original circle-intersection implementation of standard geometry; no sample source code was copied.

## Verification

Automated checks verify bone lengths across quadrants, finite unreachable poses, eight legs, fixed document contacts during scroll, planted-foot invariance during a moving stride, a maximum of three lifted feet, an exact pause, ordered sparse targets, phrase boundaries, and the existing speech/text checks. Browser checks exercise both crawling styles, phrase highlights, completion, pause/resume, scrolling, and the narrow layout. These checks establish the implemented behavior; visual similarity is judged against the supplied frames, not by the number of tests.

## Version 3 additions

The speed control now reaches 5× (950 words/minute in every-word mode), with quick presets. The body integration, stance cooldowns, foot-swing duration, scheduling, target dwell, and auto-scroll all scale with pace. Device speech engines may enforce their own limits.

Every completed run displays a summary and key ideas. The summary uses representative sentences from the full input, so the animation’s skipped function words are still available to establish meaning. Summary tests include neutral technical text, factual quantities, an explicit approval condition, a stated limit on a robot’s role, abbreviations, empty input, and markup-like text.

## Version 4: pointing and tracing

The user identified an interaction missing from the reconstruction: the creature actively points at words and draws around them. The browser version now reserves its two forelegs for that action. One toe reaches the selected word and holds a pointing pose while the other follows a sampled, slightly irregular circle and then an underline. The visible ink is the completed prefix of that exact toe path. The other six legs support the body, with at most two supporting feet lifted together.

The forelegs reach before ink appears, lift the pen between strokes and wrapped lines, then return to walking. Marks and callouts remain attached to the text. Pause preserves the partial stroke and joints; speed scales the complete gesture through 5×. The summary waits until pending marks finish in every-word mode. Reflow rebuilds paths around their current word boxes while preserving drawing progress. Reduced motion completes the mark without animated tracing.

Ten additional checks cover contact before drawing, matching pen and ink endpoints, underlining, pause, supporting contacts, 5× gesture timing, wrapped phrases, reflow while running or paused, and reduced motion. These gestures are an implementation of the visible behavior described by the user, not a claim about the original creator’s rig.

## Version 5: speed through 100×

The maximum pace is 100× (19,000 words/minute before punctuation pauses), with additional 10×, 25×, 50×, and 100× presets. A deadline-based word clock consumes every due word instead of limiting reading to one word per screen refresh. The gait, reaching, drawing, target transitions, and scroll following advance in smaller simulation steps; the canvas paints once per screen refresh. High speeds can therefore finish several gestures between visible frames while preserving their paths and accounting for every visited word.

Tests verify 1,000-word timing and complete coverage at 30, 60, and 120 Hz, speech chunk limits after a delayed frame, stable body integration at 100×, and reach/circle/underline timing through 100×. Audio pauses above 10× to preserve visual speed. The [Web Speech API specification](https://webaudio.github.io/web-speech-api/#dom-speechsynthesisutterance-rate) disallows rates above 10 and permits speech engines to constrain the rate further.
