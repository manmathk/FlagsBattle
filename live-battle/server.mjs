import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import { Server as SocketIOServer } from 'socket.io';
import { COUNTRIES, normalizeCountryInput } from './public/countries.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
const PORT = Number(process.env.PORT || 8787);
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const COOLDOWN_MS = Math.max(0, Number(process.env.VOTE_COOLDOWN_MS || 12000));
const DEMO_MODE = String(process.env.DEMO_MODE || 'false').toLowerCase() === 'true';

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: true, credentials: true } });
app.use(express.json({ limit: '32kb' }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

const state = {
  scores: Object.fromEntries(COUNTRIES.map((c) => [c.code, 0])),
  totalVotes: 0,
  uniqueVoters: 0,
  acceptedVotes: 0,
  rejectedVotes: 0,
  lastVote: null,
  youtube: { connected: false, live: false, broadcastId: null, liveChatId: null, lastError: null, lastMessageAt: null, nextPollMs: null }
};
const seenVoters = new Set();
const cooldowns = new Map();
let saveTimer = null;
let youtubeLoopRunning = false;
let youtubeStopRequested = false;
let oauthState = null;

async function loadScores() {
  try {
    const raw = await fs.readFile(SCORES_FILE, 'utf8');
    const saved = JSON.parse(raw);
    for (const country of COUNTRIES) state.scores[country.code] = Number(saved.scores?.[country.code] || 0);
    state.totalVotes = Number(saved.totalVotes || Object.values(state.scores).reduce((a, b) => a + b, 0));
    state.acceptedVotes = Number(saved.acceptedVotes || state.totalVotes);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await persistScores();
  }
}
function scheduleSave() { if (saveTimer) return; saveTimer = setTimeout(async () => { saveTimer = null; await persistScores(); }, 500); }
async function persistScores() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SCORES_FILE, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), scores: state.scores, totalVotes: state.totalVotes, acceptedVotes: state.acceptedVotes }, null, 2));
}
function leaderboard(limit = 10) {
  return COUNTRIES.map((country) => ({ ...country, score: state.scores[country.code] || 0 })).sort((a, b) => b.score - a.score || a.number - b.number).slice(0, limit);
}
function allCountries() {
  return COUNTRIES.map((country) => ({ ...country, score: state.scores[country.code] || 0 })).sort((a, b) => b.score - a.score || a.number - b.number);
}
function snapshot() {
  return { leaderboard: leaderboard(10), totalVotes: state.totalVotes, uniqueVoters: state.uniqueVoters, acceptedVotes: state.acceptedVotes, rejectedVotes: state.rejectedVotes, countryCount: COUNTRIES.length, lastVote: state.lastVote, youtube: state.youtube };
}
function emitSnapshot() { io.emit('state', snapshot()); }
function acceptVote(country, voterId, source = 'youtube') {
  if (!country) return { ok: false, reason: 'unknown-country' };
  const now = Date.now();
  if (voterId) {
    const last = cooldowns.get(voterId) || 0;
    if (now - last < COOLDOWN_MS) { state.rejectedVotes += 1; return { ok: false, reason: 'cooldown' }; }
    cooldowns.set(voterId, now);
    if (!seenVoters.has(voterId)) { seenVoters.add(voterId); state.uniqueVoters += 1; }
  }
  state.scores[country.code] = (state.scores[country.code] || 0) + 1;
  state.totalVotes += 1;
  state.acceptedVotes += 1;
  state.lastVote = { country: { code: country.code, number: country.number, name: country.name, flag: country.flag }, at: new Date(now).toISOString(), source };
  scheduleSave();
  io.emit('vote', { country: state.lastVote.country, score: state.scores[country.code], totalVotes: state.totalVotes, at: state.lastVote.at, source });
  emitSnapshot();
  return { ok: true, country: state.lastVote.country, score: state.scores[country.code] };
}
function hasYoutubeCredentials() { return Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REFRESH_TOKEN); }
function oauthClient() { return new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET, `${PUBLIC_URL.replace(/\/$/, '')}/oauth2/callback`); }
function youtubeClient() {
  if (!hasYoutubeCredentials()) return null;
  const auth = oauthClient();
  auth.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  return google.youtube({ version: 'v3', auth });
}
async function findLiveChatId(youtube) {
  if (process.env.YOUTUBE_BROADCAST_ID) {
    const response = await youtube.liveBroadcasts.list({ part: 'id,snippet,status', id: [process.env.YOUTUBE_BROADCAST_ID] });
    const broadcast = response.data.items?.[0];
    if (!broadcast) throw new Error('Configured YOUTUBE_BROADCAST_ID was not found.');
    if (broadcast.status?.lifeCycleStatus !== 'live') throw new Error(`Configured broadcast is not live (status: ${broadcast.status?.lifeCycleStatus || 'unknown'}).`);
    if (!broadcast.snippet?.liveChatId) throw new Error('Configured broadcast has no liveChatId. Is live chat enabled?');
    return { broadcastId: broadcast.id, liveChatId: broadcast.snippet.liveChatId };
  }
  const response = await youtube.liveBroadcasts.list({ part: 'id,snippet,status', mine: true, broadcastStatus: 'active', maxResults: 10 });
  const live = (response.data.items || []).find((broadcast) => broadcast.status?.lifeCycleStatus === 'live' && broadcast.snippet?.liveChatId);
  if (!live) return null;
  return { broadcastId: live.id, liveChatId: live.snippet.liveChatId };
}
async function pollYoutube() {
  if (!hasYoutubeCredentials()) {
    state.youtube.connected = false;
    state.youtube.live = false;
    state.youtube.lastError = 'YouTube OAuth credentials are not configured; running in demo/static mode.';
    return;
  }
  const youtube = youtubeClient();
  if (!youtube) return;
  let pageToken;
  let liveChatId = null;
  let broadcastId = null;
  while (!youtubeStopRequested) {
    try {
      if (!liveChatId) {
        const live = await findLiveChatId(youtube);
        if (!live) {
          state.youtube.connected = true;
          state.youtube.live = false;
          state.youtube.broadcastId = null;
          state.youtube.liveChatId = null;
          state.youtube.lastError = null;
          state.youtube.nextPollMs = 15000;
          emitSnapshot();
          await sleep(15000);
          continue;
        }
        liveChatId = live.liveChatId;
        broadcastId = live.broadcastId;
        pageToken = undefined;
      }
      const response = await youtube.liveChatMessages.list({ liveChatId, part: 'id,snippet,authorDetails', maxResults: 2000, ...(pageToken ? { pageToken } : {}) });
      state.youtube.connected = true;
      state.youtube.live = true;
      state.youtube.broadcastId = broadcastId;
      state.youtube.liveChatId = liveChatId;
      state.youtube.lastError = null;
      state.youtube.lastMessageAt = new Date().toISOString();
      for (const item of response.data.items || []) {
        if (item.snippet?.type !== 'textMessageEvent') continue;
        const country = normalizeCountryInput(item.snippet?.displayMessage);
        if (!country) continue;
        const voterId = item.authorDetails?.channelId || item.snippet?.authorChannelId || item.id;
        acceptVote(country, voterId, 'youtube');
      }
      pageToken = response.data.nextPageToken;
      const wait = Math.max(1000, Number(response.data.pollingIntervalMillis || 5000));
      state.youtube.nextPollMs = wait;
      emitSnapshot();
      await sleep(wait);
    } catch (error) {
      const reason = error?.response?.data?.error?.message || error?.message || String(error);
      const lower = reason.toLowerCase();
      const chatEnded = lower.includes('livechatended') || lower.includes('live chat has ended') || lower.includes('livechatnotfound') || lower.includes('live chat is not enabled');
      if (chatEnded) {
        liveChatId = null;
        broadcastId = null;
        pageToken = undefined;
        state.youtube.connected = true;
        state.youtube.live = false;
        state.youtube.broadcastId = null;
        state.youtube.liveChatId = null;
        state.youtube.lastError = reason;
        state.youtube.nextPollMs = 5000;
        emitSnapshot();
        await sleep(5000);
      } else {
        state.youtube.connected = false;
        state.youtube.live = false;
        state.youtube.lastError = reason;
        state.youtube.nextPollMs = 30000;
        emitSnapshot();
        await sleep(30000);
      }
    }
  }
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function startYoutubeLoop() { if (youtubeLoopRunning) return; youtubeLoopRunning = true; youtubeStopRequested = false; pollYoutube().finally(() => { youtubeLoopRunning = false; }); }

app.get('/api/state', (_req, res) => res.json(snapshot()));
app.get('/api/all-state', (_req, res) => res.json({ countries: allCountries(), totalVotes: state.totalVotes, uniqueVoters: state.uniqueVoters, countryCount: COUNTRIES.length, lastVote: state.lastVote, youtube: state.youtube }));
app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime(), youtube: state.youtube }));
app.get('/api/config', (_req, res) => res.json({ demoMode: DEMO_MODE, cooldownMs: COOLDOWN_MS, countryCount: COUNTRIES.length, youtubeConfigured: hasYoutubeCredentials() }));
app.post('/api/demo-vote', (req, res) => {
  if (!DEMO_MODE) return res.status(403).json({ ok: false, error: 'Demo mode is disabled.' });
  const country = normalizeCountryInput(req.body?.country || req.body?.message);
  const result = acceptVote(country, `demo-${crypto.randomUUID()}`, 'demo');
  res.status(result.ok ? 200 : 400).json(result);
});
app.post('/api/reset', async (_req, res) => {
  for (const country of COUNTRIES) state.scores[country.code] = 0;
  state.totalVotes = 0; state.acceptedVotes = 0; state.rejectedVotes = 0; state.lastVote = null;
  seenVoters.clear(); cooldowns.clear();
  await persistScores(); emitSnapshot(); res.json({ ok: true });
});
app.get('/oauth2/start', (_req, res) => {
  if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) return res.status(500).send('Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET first.');
  oauthState = crypto.randomBytes(24).toString('hex');
  const url = oauthClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', include_granted_scopes: true, scope: ['https://www.googleapis.com/auth/youtube.readonly'], state: oauthState });
  res.redirect(url);
});
app.get('/oauth2/callback', async (req, res) => {
  if (!req.query.state || req.query.state !== oauthState) return res.status(400).send('Invalid OAuth state.');
  if (!req.query.code) return res.status(400).send(`OAuth failed: ${req.query.error || 'missing code'}`);
  try {
    const { tokens } = await oauthClient().getToken(String(req.query.code));
    if (!tokens.refresh_token) return res.status(400).send('Google did not return a refresh token. Revoke the app grant and authorize again with consent.');
    res.type('html').send(`<!doctype html><html><body style="font-family:system-ui;max-width:800px;margin:60px auto"><h1>OAuth complete</h1><p>Copy this refresh token into <code>YOUTUBE_REFRESH_TOKEN</code> on your server. Do not publish it.</p><textarea style="width:100%;height:100px">${tokens.refresh_token}</textarea><p>Then restart the server.</p></body></html>`);
  } catch (error) { res.status(500).send(`OAuth error: ${error.message}`); }
});
io.on('connection', (socket) => socket.emit('state', snapshot()));
await loadScores();
startYoutubeLoop();
httpServer.listen(PORT, () => { console.log(`FlagsBattle Live Country Battle: ${PUBLIC_URL}`); console.log(`Demo mode: ${DEMO_MODE}`); console.log(`YouTube configured: ${hasYoutubeCredentials()}`); });
