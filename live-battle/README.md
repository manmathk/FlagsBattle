# FlagsBattle — Live Country Battle

A broadcast-first YouTube Live overlay where viewers vote for their country in chat and the leaderboard updates in real time.

## Included

- 9:16-first country wall inspired by fast-scrolling live ranking overlays
- 195-country ISO list with stable numbers and flag emoji
- Country-name, ISO-code, alias, and number parsing
- Comment votes worth configurable points (default `+1`)
- Super Chat, Super Sticker, YouTube Gift and membership-gift boosts (default `+1000`)
- Gift senders shown in a **Special Thanks** strip
- Paid-event ticker such as `@Viewer boosted Nepal!`
- Server-side YouTube OAuth
- One accepted comment vote per viewer per configurable cooldown
- Duplicate-event protection, including YouTube gift combo updates
- Persistent score snapshots in `data/scores.json`
- Socket.IO real-time updates
- Overtake/score animations and voice announcements
- `?demo=1` local demo controls
- OAuth helper that prints a refresh token after authorization

## Local demo

```bash
cd live-battle
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:8787/?demo=1` and click countries to simulate chat votes.

## Connect YouTube Live Chat

1. Create a Google Cloud project and enable **YouTube Data API v3**.
2. Create an OAuth 2.0 **Web application** credential.
3. Add `http://localhost:8787/oauth2/callback` as an authorized redirect URI.
4. Put the client ID and client secret into `.env`.
5. Start the server and open `http://localhost:8787/oauth2/start`.
6. Complete Google authorization and copy the returned refresh token into `YOUTUBE_REFRESH_TOKEN`.
7. Restart the server.
8. Start your YouTube live broadcast. The server discovers an active broadcast and caches its live-chat ID.
9. For the lowest discovery traffic, set `YOUTUBE_BROADCAST_ID` to the current broadcast ID.

For production, set `PUBLIC_URL` to the HTTPS server URL and register `${PUBLIC_URL}/oauth2/callback` in Google Cloud. Never put OAuth secrets in frontend code or a public repository.

## YouTube quota protection

The chat reader deliberately does **not** poll on a fixed 1–5 second timer. It honors YouTube's returned `pollingIntervalMillis` and applies a configurable minimum delay. The default `YOUTUBE_MIN_POLL_MS=10000` caps the theoretical chat polling rate at about 8,640 requests/day for a continuously live 24-hour stream, before discovery calls.

Additional protections:

- live-broadcast discovery is cached and defaults to once every 60 seconds when no chat is active
- the live broadcast is not re-discovered while its chat is active
- API errors use exponential backoff up to 5 minutes
- `fields` requests only the message properties the game needs, reducing response bandwidth
- duplicate chat messages are ignored
- gift combo IDs are tracked so a growing combo only awards the newly added gifts

YouTube's current API documentation recommends `liveChatMessages.streamList` for the most efficient low-latency chat consumption. The current Node implementation keeps the simpler REST polling path for deployment portability, while using the server-provided polling interval and a quota-safe floor. If we later move the worker to a gRPC-capable runtime, `streamList` is the next upgrade.

## OBS

Add a **Browser Source** pointing to the public server URL. The overlay automatically adapts to portrait and landscape canvases. A 9:16 canvas is the primary design target for the country-wall layout.

## Vote syntax

Examples: `India`, `IN`, `77`, `Bharat`, `USA`, `UK`, `Brasil`, `Deutschland`, `Türkiye`. The parser also accepts punctuation/emoji around country names.

## Paid boosts

A viewer should first choose a country with a normal chat message. Their later Super Chat, Super Sticker, YouTube Gift, or membership gift then boosts that last selected country. A Super Chat/Super Sticker can also include the country directly in its message.

Configure point values with:

```env
COMMENT_POINTS=1
PAID_POINTS=1000
YOUTUBE_MIN_POLL_MS=10000
YOUTUBE_DISCOVERY_MS=60000
```

## Architecture

```text
YouTube Live Chat → Node + YouTube Data API → parser / anti-spam / paid boosts → score state → Socket.IO → OBS Browser Source → YouTube Live
```
