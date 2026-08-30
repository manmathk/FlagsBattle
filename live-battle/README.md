# FlagsBattle — Live Country Battle

A broadcast-first YouTube Live overlay where viewers vote for their country in chat and the leaderboard updates in real time.

## Included

- 1920×1080 OBS-ready display
- 195-country ISO list with stable numbers and flag emoji
- Country-name, ISO-code, alias, and number parsing
- YouTube Live Chat polling with server-side OAuth
- One accepted vote per viewer per configurable cooldown
- Persistent score snapshots in `data/scores.json`
- Socket.IO real-time updates
- Overtake animations, live #1 battle, vote toast, and broadcast stats
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
8. Start your YouTube live broadcast. The server automatically finds an active broadcast with live chat. Set `YOUTUBE_BROADCAST_ID` to lock it to one broadcast.

For production, set `PUBLIC_URL` to the HTTPS server URL and register `${PUBLIC_URL}/oauth2/callback` in Google Cloud. Never put OAuth secrets in frontend code or a public repository.

## OBS

Add a **Browser Source** pointing to the public server URL. Use **1920×1080**. The display is designed as a fixed broadcast canvas with no scrollbars.

## Vote syntax

Examples: `India`, `IN`, `77`, `Bharat`, `USA`, `UK`, `Brasil`, `Deutschland`, `Türkiye`. The parser also accepts punctuation/emoji around country names.

## Architecture

```text
YouTube Live Chat → Node + YouTube Data API → parser/anti-spam → score state → Socket.IO → OBS Browser Source → YouTube Live
```

The implementation uses `liveChatMessages.list` and honors YouTube's returned `pollingIntervalMillis` rather than polling at an arbitrary fixed interval.
