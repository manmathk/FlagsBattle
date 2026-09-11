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
- Duplicate-event protection, including YouTube gift combo updates
- Persistent score snapshots in `data/scores.json`
- Socket.IO real-time updates with short server-side batching
- `?demo=1` local demo controls
- OAuth helper that prints a refresh token after authorization
- **YouTube `liveChatMessages.streamList` over gRPC** for persistent, push-based chat delivery

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
8. Start your YouTube live broadcast. The server discovers an active broadcast and opens one persistent `streamList` connection.
9. For the lowest discovery traffic, set `YOUTUBE_BROADCAST_ID` to the current broadcast ID.

For production, set `PUBLIC_URL` to the HTTPS server URL and register `${PUBLIC_URL}/oauth2/callback` in Google Cloud. Never put OAuth secrets in frontend code or a public repository.

## Quota-efficient architecture

The live-chat worker now uses Google's documented **server-streaming `liveChatMessages.streamList` gRPC method** instead of repeatedly calling `liveChatMessages.list`. YouTube pushes chat responses over a long-lived HTTP/2 connection, so the game no longer spends a quota request every few seconds just to ask whether a new comment exists. Google documents `streamList` as the low-latency streaming approach and provides the `stream_list.proto` definition used by this project.

The remaining YouTube Data API traffic is intentionally low frequency:

- active broadcast discovery is cached for `YOUTUBE_DISCOVERY_MS` (default 60 seconds)
- setting `YOUTUBE_BROADCAST_ID` avoids broad `mine=true` discovery
- the gRPC stream reconnects with exponential backoff after transient failures
- the last `nextPageToken` is reused when reconnecting so messages are not unnecessarily replayed
- message IDs and gift combo counts are deduplicated in memory
- Socket.IO state snapshots are batched for 50ms during message bursts

There is **no fixed live-chat polling timer** in the active server.

## OBS

Add a **Browser Source** pointing to the public server URL. The overlay automatically adapts to portrait and landscape canvases. A 9:16 canvas is the primary design target for the country-wall layout.

## Vote syntax

Examples: `India`, `IN`, `77`, `Bharat`, `USA`, `UK`, `Brasil`, `Deutschland`, `Türkiye`. The parser also accepts punctuation/emoji around country names.

## Paid boosts

A viewer should first choose a country with a normal chat message. Their later Super Chat, Super Sticker, YouTube Gift, or membership gift then boosts that last selected country. A Super Chat can also include the country directly in its message.

Configure point values with:

```env
COMMENT_POINTS=1
PAID_POINTS=1000
YOUTUBE_DISCOVERY_MS=60000
```

## Architecture

```text
YouTube Live Chat
       │
       ▼
streamList gRPC (one persistent connection)
       │
       ▼
parser → dedupe/anti-spam → paid boosts → score state
       │
       ▼
Socket.IO (batched state + instant events)
       │
       ▼
OBS Browser Source
```
