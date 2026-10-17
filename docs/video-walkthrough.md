# "How Tarafab.XAi Works" video walkthrough

A one-minute (61.5 s) introduction on the public landing page, under the hero buttons.

## Where it lives

- **Player:** `components/landing/HowItWorks.tsx`. Styles are under `.hiw-*` in `app/globals.css`, and strings under `hiw` in every locale.
- **Assets** (`public/media/`, served with a one-day public cache):

| File | Format | Size |
|---|---|---|
| `how-it-works.mp4` | H.264 High / AAC, 1280×720, 30 fps, 61.5 s | about 3.8 MB |
| `how-it-works.webm` | VP9 / Opus fallback, for browsers without H.264 | about 2.5 MB |
| `how-it-works-poster.webp` | Poster for the player | about 17 KB |
| `how-it-works-thumb.webp` | Card thumbnail | about 11 KB |
| `how-it-works.en.vtt` | English captions | |

## Player behaviour

- **Loading:** nothing loads until the visitor opens the player. The card shows only a small thumbnail.
- **Playback:** it starts from the visitor's tap and never by itself. Native controls provide play/pause, seeking, volume, captions and fullscreen, including on iOS Safari (`playsInline`).
- **Chapters:** six chapter buttons seek to each scene.
- **Opening and closing:**
  - Escape, the close button or a tap outside closes the player.
  - Page scrolling is locked only while it's open, and the scroll position is kept.
  - Focus stays in the dialog while open, and returns to the button that opened it.
- **Minimize:** keeps playing in a small player bottom-left. The support chat sits bottom-right, so they never overlap. If the small player would cover "Open an account" or "Sign in", it moves to the top-left until those buttons scroll away.
- **Support chat:** while the full player is open, the chat bubble is hidden through the existing `data-chat-avoid` mechanism.
- **Reduced motion:** with reduced motion requested, the player and card don't animate.

## Scenes (narration, as recorded)

Revision 3 focuses on investing and follows the requested chapter plan (0:00 / 0:08 / 0:20 / 0:33 / 0:46 / 0:54) to within a second. The total length is 61.5 s: the closing narration needs about 8 s, so the last chapter is slightly longer than the 6 s planned.

| Time | Scene | Narration |
|---|---|---|
| 0:00–0:08 | The investment opportunity (brand frame) | "Every investment journey begins with a decision. Welcome to Tarafab.XAi." |
| 0:08–0:19.5 | Choose an investment: Investment Plans, then a plan's details | "At Tarafab.XAi, explore the available investment opportunities, compare their terms, and choose a plan that aligns with your financial goals." |
| 0:19.5–0:32 | Place an investment: Amount, Review, Confirm, then the result | "Review the amount you want to invest, understand the investment period, and confirm the details before getting started." |
| 0:32–0:45 | Track your progress: My investments, then an investment's details | "Follow your investments through your personal dashboard, monitor their progress, and review returns as they are actually credited." |
| 0:45–0:53 | Market monitoring: XAI Automation Engine | "With portfolio information and market monitoring tools in one place, you can stay informed as you work toward your financial goals." |
| 0:53–1:01.5 | Get started: closing frame | "Your investment journey starts with Tarafab.XAi. Explore the opportunities. Understand the terms. Plan for your future." |

In the confirm step, the demo submission is answered locally with the status a real request receives: "Pending review", reference DEMO-INV-02. Nothing is sent to the server or created.

The demo products carry illustrative terms and are labelled as not an offer. The tracked demo investment shows $0.00 credited.

## How it was produced (and how to regenerate it)

Everything is in `tools/walkthrough/`.

1. **Recording (`rec.js`).** The real application, running locally, is recorded through Chrome's screencast while signed in as an isolated demo user.
   - Every API request is answered locally with labelled demo data. Nothing reaches the production database.
   - Write requests are refused, and no investment or transaction is created.
   - Each app screen carries a "Demo account · sample data" label.
   - The demo products are named "Demo … Portfolio", with illustrative terms described as "not an offer".
   - The live catalogue's terms were deliberately not shown.
2. **Voice-over (`gen.py`).** Kokoro TTS (Apache-2.0), voice `af_heart`, generated locally from `scenes.json`.
3. **Compositing (`build.py`).** It builds the cross-faded timeline and places each narration in its scene. It adds a quiet ambient bed synthesised from sine tones (no third-party music), normalises loudness, encodes H.264/AAC, and extracts the poster and timed captions.
4. **WebM, poster and thumbnail.** These come from the final MP4. The WebM is encoded with 2-pass VP9 at CRF 38.
5. **Fonts.** Inter (OFL) for the intro and outro frames.

**Regenerating after UI changes:**
1. Run the app on port 3100.
2. Run `node rec.js`.
3. Run `python3 build.py`. Set `FFMPEG` and `PLAYWRIGHT_MODULE` if they aren't on the path.
4. Copy `out/*` into `public/media/` and re-encode the WebM.
5. Scene lengths are in `durations.json`; a scene longer than its recording holds its last frame. If they change, update the chapter times in `HowItWorks.tsx`.

## Still for a person to decide

- **Voice:** the voice-over is synthetic. A professional human voice-over can replace it by swapping the `vo_*.wav` files and re-running `build.py`.
- **Language:** narration and captions are English only. Other languages show a note saying so.
