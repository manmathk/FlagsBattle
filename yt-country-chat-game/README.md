# YouTube Country Chat Game

Real-time YouTube Live Chat country battle based on the supplied visual. Viewers type a country name or flag emoji; the matching country gains points and the live leaderboard reorders automatically.

## Scoring

- Normal country/flag chat: **+1**
- Super Chat containing a country/flag: **+10** by default
- Super Sticker containing a country/flag: **+10** by default
- The static browser version lets you change the Super Chat and Super Sticker bonuses in the setup panel.
- The bonus is awarded only when the paid message/comment itself contains a recognized country or flag.

## GitHub Pages / browser setup

The GitHub Pages version is at `public/yt-country-chat-game/index.html` and talks directly to the YouTube Data API from the browser.

1. Enable YouTube Data API v3 in Google Cloud and create an API key.
2. Open the game page.
3. Paste the API key into **YouTube Data API Key**.
4. Enter the live stream's **Video ID**.
5. Set the target and paid-message bonuses if desired.
6. Click **Save & Connect**.

The API key and settings are saved with `localStorage` in that browser only. Nothing is committed to this repository. For production use, restrict the API key by HTTP referrer to the GitHub Pages origin and restrict it to YouTube Data API v3.

The game uses `videos.list` to discover the active live-chat ID and `liveChatMessages.list` to read the live chat. It reads `authorDetails.displayName` so every scoring event shows the viewer's YouTube name in **Recent Players & Points**. Super Chat and Super Sticker event types receive their configured bonus.

## Local Node version

The original Node/Express implementation remains in this directory for server-side deployments. The GitHub Pages version does not require Node, `.env`, WebSockets, or a backend.
