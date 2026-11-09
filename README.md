# Web Crawler — Bobs Bath

**Open the page:** https://cory56626-art.github.io/THEBOBSBATH/

Feed a tiny digital creature your own text and watch it crawl through the words. This is the main Bobs Bath GitHub Pages site. The former chess application has been removed.

## Use it

1. Type or paste text into **What is on your mind** (up to 30,000 characters), or choose **Try a sample**.
2. Press **Start crawling**. The eight-legged crawler plants its feet on the document and hunts standout words and phrases, leaving circles, threads, and colored callouts behind.
3. Choose **Hunt words & phrases** (the default) or **Read every word**. Pause or resume, restart, change the speed, or expand the reader. Click a word to jump there. Space pauses/resumes when you are not typing; Escape exits the expanded reader.

**Read aloud** uses browser speech synthesis, with the voices offered by your device/browser. In hunting mode, speech reads only the selected words/phrases. In every-word mode, native word-boundary events synchronize highlighting where available; other voices use approximate timing within short speech chunks. If speech is unsupported, denied, or unavailable, the visual reader continues. Backgrounding the page pauses reading. Resuming speech repeats the current word.

Hunting uses a local stop-word and salience heuristic, not an AI model or a claim of semantic understanding. The LOVE and HATE counters are simple positive/negative keyword matches among visited targets. They are a visual effect, not AI sentiment analysis. The crawler does not fetch websites, scrape comments, interpret text, or use an AI service.

Text and preferences are saved in this browser when local storage is available. Clear removes the saved text. There is no application backend, analytics, external font, or API key. Speech engines are supplied by the device/browser and may use their own services.

## Credit

The original web crawler concept and visual inspiration belong to **[@everything.bends](https://www.tiktok.com/@everything.bends)**, as shown in the user's reference clip. This is an unofficial homage with an original browser implementation. No source code, footage, audio, or other assets from the original were copied. Attribution is visible in the page footer.

The frame study and reconstruction limits are recorded in [REFERENCE_STUDY.md](REFERENCE_STUDY.md).

## Development and checks

The page is plain HTML, CSS, and JavaScript. No installation or build is needed. Serve the repository over HTTP:

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080/`. Run the gait, planted-contact, target-selection, tokenization, speech-offset, and timing checks with Node.js 22 or newer:

```sh
npm test
```

`.github/workflows/pages.yml` checks the JavaScript and runs those tests, then publishes the static files on pushes to `main`. Repository Settings → Pages uses GitHub Actions. Reduced-motion preferences turn off leg motion and smooth movement.
