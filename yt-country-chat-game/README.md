# YouTube Country Chat Game

Real-time YouTube Live Chat country battle based on the supplied visual. Viewers type a country name or flag emoji; the matching country gains points and the live leaderboard reorders automatically.

## Scoring

- Normal country/flag chat: **+1**
- Super Chat containing a country/flag: **+10** by default
- Super Sticker containing a country/flag: **+10** by default
- Super Chat and Super Sticker values are configurable with `SUPERCHAT_POINTS` and `SUPERSTICKER_POINTS`.

The bonus is awarded only when the paid message/comment itself contains a recognized country or flag.

## Run

1. Enable YouTube Data API v3 and create an API key.
2. Copy `.env.example` to `.env`.
3. Set `YOUTUBE_API_KEY` and `YOUTUBE_VIDEO_ID`.
4. Run `npm install`.
5. Run `npm start`.
6. Open `http://localhost:3000`.

The server resolves the active live chat from `videos.list` and reads messages from `liveChatMessages.list`. YouTube exposes Super Chat details—including amount, currency, tier and the user's comment—on live chat messages, which this game uses to distinguish paid events from normal chat.

## Important

API credentials remain server-side. Do not put the API key in frontend JavaScript.

For GitHub Pages, host only the frontend there and run this Node backend separately; GitHub Pages cannot securely perform the server-side YouTube chat polling.
