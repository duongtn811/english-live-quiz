# English Live Quiz

An interactive English-vocabulary game overlay for TikTok LIVE / OBS. Viewers guess the English
word for a Vietnamese prompt in the comments; correct answers score points, gifts reveal letters,
and the leaderboard updates live. Includes a control studio and a demo mode with simulated viewers,
so you can test everything without going live.

## Quick start

Requires Node.js 18+.

```bash
npm install
npm start
```

Open **http://127.0.0.1:3210/studio/** and click **Kết nối demo**. The phone preview starts playing
rounds immediately with simulated comments, gifts, follows, and scores.

- Studio: `http://127.0.0.1:3210/studio/`
- Overlay: `http://127.0.0.1:3210/overlay/`

Use `PORT=4000 npm start` to change the port. By default the server binds to `127.0.0.1`; set
`HOST=0.0.0.0` only on a trusted network.

## Add the overlay to a livestream

Set your canvas to **1080 × 1920** (vertical) and add a browser/web source:

| Mode | URL | Use |
| --- | --- | --- |
| Full game screen | `http://127.0.0.1:3210/overlay/` | Replace the scene with the quiz UI |
| Transparent | `http://127.0.0.1:3210/overlay/?transparent=1` | Layer the widgets over your camera |

- **OBS**: add a **Browser Source**, set 1080×1920, paste the URL, enable "Shutdown source when not
  visible" off if you stream for long sessions.
- **TikTok LIVE Studio**: versions differ. If your build supports a browser/web/Electron source, add
  the same URL at 1080×1920. Otherwise run OBS with a Browser Source and send that output to TikTok,
  or capture the browser window containing a standalone overlay window.
- Open the overlay URL directly in a browser if you just want a full-screen game window to capture.

The overlay reconnects automatically if the studio/server restarts, and its timer stays in sync with
the server clock.

## How the game works

- Each round shows a Vietnamese prompt (e.g. `tức giận`) and empty letter boxes for the English
  answer (`angry`).
- Chat comments are normalized — case, Vietnamese accents, punctuation, and emoji are stripped — and
  compared with the answer. `Angry!!` and `angry` both count.
- Each viewer scores **once per round**: 10 base points plus up to 10 speed bonus, so fast answers
  score higher.
- Gifts reveal the next hidden letter (one reveal per giver every 2.5 s). This is the "pay to unlock
  a clue" loop from the reference design.
- After the timer (30 s by default, adjustable from 10 s) the answer is revealed for 6 s, then the
  next round starts automatically. All of this is controllable from the studio.
- The leaderboard accumulates across the session and shows the top 10; the "Câu trả lời" feed
  resets each round.
- The word deck ships with 1,000 entries and cycles indefinitely, so the game never runs out.

## Auto-reset the leaderboard

Run the sidecar script next to the server to clear the leaderboard on a schedule:

```bash
npm run autoreset
```

It sends the same reset as the **Xoá điểm** button every 20 minutes. If a question is live, it
waits for the reveal phase so the current round is not interrupted. Set `RESET_MINUTES=10` to
change the interval, or `RESET_URL=ws://host:3210` if the server is not on localhost.

## Connect a real TikTok LIVE

1. Start your TikTok LIVE from the TikTok app or LIVE Studio.
2. In the studio, choose **TikTok LIVE**, enter your `@username`, and click **Kết nối TikTok**.
3. Keep the studio open. Chat, gifts, follows, and joins are fed into the game in real time.

This uses the community library [`tiktok-live-connector`](https://github.com/zerodytrash/TikTok-Live-Connector),
which talks to TikTok's internal live endpoints. It is **not an official API**: connections can be
rate-limited, captcha-gated, or break when TikTok changes its protocol, and using it may conflict
with TikTok's terms. For production/commercial use, apply for TikTok for Developers' official LIVE
APIs instead. The demo mode does not touch TikTok at all.

If a connection fails, confirm the account is actually live and the username is correct, then check
the event log in the studio.

## Customize

- **Word bank** — add/remove words in the studio. Seed data lives in `server/words.js`.
- **Host name, round length, player goal** — studio controls, applied live.
- **Look and feel** — `public/overlay/overlay.css` (colors, sizes, typography). The overlay is a
  fixed 1080×1920 canvas that scales to fit its browser source.
- **Demo personalities / gifts** — `server/feed/mock.js`.

## Project layout

```
server/
  index.js        HTTP static server + WebSocket hub + action routing
  game.js         Round engine, answer matching, scoring, leaderboard
  words.js        Seed vocabulary
  feed/mock.js    Simulated viewers for demo mode
  feed/tiktok.js  TikTok LIVE event adapter
scripts/
  auto-reset.js   Optional scheduled leaderboard reset
public/
  overlay/        1080x1920 transparent-capable overlay (browser source)
  studio/         Control dashboard (connect, rounds, words, logs)
```

## Known limits

- One game room per server instance; all connected studios/overlays share it.
- State is in memory — restarting the server resets words, scores, and settings.
- No authentication; intended to run locally. Do not expose it to the public internet as-is.
- The UI text is Vietnamese (the target audience), while the quiz content is Vietnamese → English.

Not affiliated with TikTok.
