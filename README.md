# Web Crawler — Bobs Bath

**Open the page:** https://cory56626-art.github.io/THEBOBSBATH/

Feed a tiny digital creature your own text and watch it crawl through the words. This is the main Bobs Bath GitHub Pages site. The former chess application has been removed.

Choose **Web Crawler** or **Omega Typer** above the reader. Both modes share your input and the speed presets through **100×**.

## Omega Typer

Choose **Omega Typer**, enter text, and press **Start typing**. Two wireframe hands with pink finger joints press a compact keyboard while your text appears character by character above them. Each character appears when its finger contacts the corresponding key. Uppercase letters and shifted punctuation use the opposite hand's Shift key; emoji and other composed characters use the Ω key.

The hands use curved, three-joint fingers and outlined 3D palms/cuffs. Each finger keeps its own path between keys, preparing upcoming strikes while other fingers finish. The wrists move and turn toward the next keys, and fingers lift along arcs rather than resetting to a flat home pose for every letter. Soft colored key trails remain after a press. The hands release the last key smoothly before the copy finishes.

This mode types an exact copy of your input, retaining capitalization, punctuation, spaces, tabs, newlines, and Unicode. It does not generate a reply. Pause freezes the hands and text; resume, restart, clear, expand, and **Copy text** are available. Input and mode changes reset the copy. High speeds process all intervening keystrokes, including those between visible frames. Reduced motion leaves the hands still while the text is copied. Read-aloud and the crawler's topic/summary controls apply to Web Crawler mode.

The direct mode link is https://cory56626-art.github.io/THEBOBSBATH/?mode=omega. The new mode is inspired by the second reference clip supplied by the user, with visible credit to **@everything.bends** beside the hands and in the footer.

## Use it

1. Type or paste text into **What is on your mind** (up to 30,000 characters), or choose **Try a sample**.
2. Press **Start crawling**. The eight-legged crawler plants its feet on the document and hunts standout words and phrases. One foreleg points at the selected words while the other traces their circle and underline, leaving threads and colored callouts behind.
3. Choose **Hunt words & phrases** (the default) or **Read every word**. The speed slider reaches **100×**, with **1× / 2× / 3× / 5× / 10× / 25× / 50× / 100×** presets. Body motion, foot lifts, drawing, dwell periods, and scroll following scale with pace.
4. At the end, **What it was saying** shows a summary of the full input and its key ideas. Use **Copy summary** to copy the takeaway. Editing, clearing, restarting, or switching modes resets the result.

Pause or resume, restart, or expand the reader. Click a word to jump there. Space pauses/resumes when you are not typing; Escape exits the expanded reader.

The drawing leg and growing ink use the same path, so each mark follows its toe rather than appearing all at once. Six supporting legs keep the body planted while the forelegs work. Pausing freezes the gesture and partial drawing; the gestures scale with speed through 100×. Wrapped phrases receive a separate circle on each line, with the pen lifted between strokes. Every-word mode finishes its queued marks before showing the summary. At high speeds, multiple words and gestures can finish between screen refreshes; they are still processed in order.

**Read aloud** uses browser speech synthesis, with the voices offered by your device/browser. Audio pauses above 10× so it cannot hold back the visual crawl; choosing 10× or slower enables it again when the toggle is on. Speech engines may apply lower limits. In hunting mode, speech reads only the selected words/phrases. In every-word mode, native word-boundary events synchronize highlighting where available; other voices use approximate timing within short speech chunks. If speech is unsupported, denied, or unavailable, the visual reader continues. Backgrounding the page pauses reading. Resuming speech repeats the current word.

Hunting ranks topics across the full document using term co-occurrence, repetition across sentences, phrase coverage, and sentence context. Emotion words have no ranking bonus. Cyan highlights and the KEY IDEA strip show names, actions, subjects, measurements, and other salient terms. The secondary LOVE/HATE counters are dictionary-based tone effects.

The end summary selects representative original sentences, combines them in source order, and shows key-idea chips. It reads the entire input, including words skipped by the animation. Original wording, quantities, and explicit conditions are retained. This is a local extractive summarizer; implicit meaning and sarcasm can require human interpretation. The page has no language-model service or API key. It does not fetch websites or scrape comments.

Text and preferences are saved in this browser when local storage is available. Clear removes the saved text. There is no application backend, analytics, external font, or API key. Speech engines are supplied by the device/browser and may use their own services.

## Credit

The original **Web Crawler** and **Omega Typer** concepts and visual inspiration belong to **[@everything.bends](https://www.tiktok.com/@everything.bends)**, as shown in the user's reference clips. This is an unofficial homage with an original browser implementation. No source code, footage, audio, or other assets from the original were copied. Attribution is visible in the page footer and beside the typing hands.

The frame study and reconstruction limits are recorded in [REFERENCE_STUDY.md](REFERENCE_STUDY.md).

## Development and checks

The page is plain HTML, CSS, and JavaScript. No installation or build is needed. Serve the repository over HTTP:

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080/`. Run the gait, planted-contact, pointing/tracing, topic-selection, summary, tokenization, speech-offset, and 100× timing checks with Node.js 22 or newer:

```sh
npm test
```

`.github/workflows/pages.yml` checks the JavaScript and runs those tests, then publishes the static files on pushes to `main`. Repository Settings → Pages uses GitHub Actions. Reduced-motion preferences turn off leg motion and smooth movement.
