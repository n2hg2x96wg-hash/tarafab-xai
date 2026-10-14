# "How Tarafab.XAi Works" video walkthrough

A 60-second introduction on the public landing page, under the hero buttons.

## Where it lives

- **Player:** `components/landing/HowItWorks.tsx`. Styles are under `.hiw-*` in `app/globals.css`, and strings under `hiw` in every locale.
- **Assets** (`public/media/`, served with a one-day public cache):

| File | Format | Size |
|---|---|---|
| `how-it-works.mp4` | H.264 High / AAC, 1280×720, 30 fps, 60.2 s | about 4.5 MB |
| `how-it-works.webm` | VP9 / Opus fallback, for browsers without H.264 | about 2.7 MB |
| `how-it-works-poster.webp` | Poster for the player | about 17 KB |
| `how-it-works-thumb.webp` | Card thumbnail | about 11 KB |
| `how-it-works.en.vtt` | English captions | |

## Player behaviour

- **Loading:** nothing loads until the visitor opens the player. The card shows only a small thumbnail.
- **Playback:** it starts from the visitor's tap and never by itself. Native controls provide play/pause, seeking, volume, captions and fullscreen, including on iOS Safari (`playsInline`).
- **Chapters:** five chapter buttons seek to each scene.
- **Opening and closing:**
  - Escape, the close button or a tap outside closes the player.
  - Page scrolling is locked only while it's open, and the scroll position is kept.
  - Focus stays in the dialog while open, and returns to the button that opened it.
- **Minimize:** keeps playing in a small player bottom-left. The support chat sits bottom-right, so they never overlap. If the small player would cover "Open an account" or "Sign in", it moves to the top-left until those buttons scroll away.
- **Support chat:** while the full player is open, the chat bubble is hidden through the existing `data-chat-avoid` mechanism.
- **Reduced motion:** with reduced motion requested, the player and card don't animate.

## Scenes (narration, as recorded)

| Time | Scene | Narration |
|---|---|---|
| 0:00–0:06 | Brand introduction (logo, chart, tagline) | "Welcome to Tarafab.XAi, where market insights meet intelligent automation." |
| 0:05–0:15 | Real client dashboard | "Your dashboard brings your balances, recent activity, and available investment products together, so you can review your account in one place." |
| 0:14–0:33 | Investment Center → product terms → amount and confirmation step (never submitted) | "Browse the investment products, and open one to review its limits, duration, fees, and stated terms. Confirm only when you understand them. Projected terms and profits actually credited are always shown separately, and you can follow every investment from your dashboard." |
| 0:32–0:49 | XAI Automation Engine card → Automation Center | "The XAI Automation Engine monitors your selected markets, and evaluates the rules you configure every minute. Each check and alert is recorded, so you can follow market activity and stay informed. It monitors and alerts. It does not place trades." |
| 0:48–1:00 | Closing frame | "Explore investment opportunities, follow market activity, and stay informed throughout your investment journey. Understand the risks, and discover Tarafab.XAi." |

The closing frame reads: "Investing involves risk. Returns are not guaranteed. Demo screens use sample data."

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
5. If scene lengths change, update the chapter times in `HowItWorks.tsx`.

## Still for a person to decide

- **Voice:** the voice-over is synthetic. A professional human voice-over can replace it by swapping the `vo_*.wav` files and re-running `build.py`.
- **Language:** narration and captions are English only. Other languages show a note saying so.
