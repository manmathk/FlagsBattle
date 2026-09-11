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
const COMMENT_POINTS = Math.max(1, Number(process.env.COMMENT_POINTS || 1));
const PAID_POINTS = Math.max(1, Number(process.env.PAID_POINTS || 1000));
const MIN_POLL_MS = Math.max(5000, Number(process.env.YOUTUBE_MIN_POLL_MS || 10000));
const DISCOVERY_MS = Math.max(15000, Number(process.env.YOUTUBE_DISCOVERY_MS || 60000));
const DEMO_MODE = String(process.env.DEMO_MODE || 'false').toLowerCase() === 'true';
const RECENT_EVENT_LIMIT = 18;
const SUPPORTER_LIMIT = 12;

const app = express();
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: true, credentials: true } });
app.use(express.json({ limit: '32kb' }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

const state = {
  scores: Object.fromEntries(COUNTRIES.map((c) => [c.code, 0])),
  totalPoints: 0,
  totalVotes: 0,
  uniqueVoters: 0,
  acceptedVotes: 0,
  rejectedVotes: 0,
  lastEvent: null,
  recentEvents: [],
  supporters: [],
  youtube: { connected: false, live: false, broadcastId: null, liveChatId: null, lastError: null, lastMessageAt: null, nextPollMs: null }
};

const seenVoters = new Set();
const cooldowns = new Map();
const lastCountryByVoter = new Map();
const processedMessageIds = new Set();
const giftComboCounts = new Map();
let saveTimer = null;
let youtubeLoopRunning = false;
let youtubeStopRequested = false;
let oauthState = null;
let lastDiscoveryAt = 0;

async function loadScores() {
  try {
    const raw = await fs.readFile(SCORES_FILE, 'utf8');
    const saved = JSON.parse(raw);
    for (const country of COUNTRIES) state.scores[country.code] = Number(saved.scores?.[country.code] || 0);
    state.totalPoints = Number(saved.totalPoints || Object.values(state.scores).reduce((a, b) => a + b, 0));
    state.totalVotes = Number(saved.totalVotes || 0);
    state.acceptedVotes = Number(saved.acceptedVotes || state.totalVotes);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await persistScores();
  }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    await persistScores();
  }, 500);
}

async function persistScores() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SCORES_FILE, JSON.stringify({
    version: 2,
    updatedAt: new Date().toISOString(),
    scores: state.scores,
    totalPoints: state.totalPoints,
    totalVotes: state.totalVotes,
    acceptedVotes: state.acceptedVotes
  }, null, 2));
}

function rankedCountries(limit = COUNTRIES.length) {
  return COUNTRIES.map((country) => ({ ...country, score: state.scores[country.code] || 0 }))
    .sort((a, b) => b.score - a.score || a.number - b.number)
    .slice(0, limit);
}

function leaderboard(limit = 10) { return rankedCountries(limit); }

function snapshot() {
  return {
    leaderboard: leaderboard(10),
    countries: rankedCountries(COUNTRIES.length),
    totalPoints: state.totalPoints,
    totalVotes: state.totalVotes,
    uniqueVoters: state.uniqueVoters,
    acceptedVotes: state.acceptedVotes,
    rejectedVotes: state.rejectedVotes,
    countryCount: COUNTRIES.length,
    lastEvent: state.lastEvent,
    recentEvents: state.recentEvents,
    supporters: state.supporters,
    youtube: state.youtube,
    rules: { commentPoints: COMMENT_POINTS, paidPoints: PAID_POINTS }
  };
}

function emitSnapshot() { io.emit('state', snapshot()); }

function rememberEvent(event) {
  state.lastEvent = event;
  state.recentEvents.unshift(event);
  state.recentEvents = state.recentEvents.slice(0, RECENT_EVENT_LIMIT);
  if (event.kind === 'paid' && event.user) {
    state.supporters = [event.user, ...state.supporters.filter((name) => name !== event.user)].slice(0, SUPPORTER_LIMIT);
  }
}

function acceptVote(country, voterId, source = 'youtube', points = COMMENT_POINTS, meta = {}) {
  if (!country) return { ok: false, reason: 'unknown-country' };
  const now = Date.now();
  if (voterId) {
    const last = cooldowns.get(voterId) || 0;
    if (source === 'youtube' && points < PAID_POINTS && now - last < COOLDOWN_MS) {
      state.rejectedVotes += 1;
      return { ok: false, reason: 'cooldown' };
    }
    cooldowns.set(voterId, now);
    if (!seenVoters.has(voterId)) {
      seenVoters.add(voterId);
      state.uniqueVoters += 1;
    }
    lastCountryByVoter.set(voterId, country.code);
  }
  state.scores[country.code] = (state.scores[country.code] || 0) + points;
  state.totalPoints += points;
  if (source === 'youtube') state.totalVotes += 1;
  state.acceptedVotes += 1;
  const event = {
    id: meta.id || crypto.randomUUID(),
    kind: points >= PAID_POINTS ? 'paid' : 'vote',
    source,
    user: meta.user || 'Viewer',
    country: { code: country.code, number: country.number, name: country.name, flag: country.flag },
    points,
    label: meta.label || (points >= PAID_POINTS ? 'BOOST' : 'COMMENT'),
    amount: meta.amount || null,
    at: new Date(now).toISOString()
  };
  rememberEvent(event);
  scheduleSave();
  io.emit('event', event);
  io.emit('vote', { ...event, score: state.scores[country.code], totalPoints: state.totalPoints });
  emitSnapshot();
  return { ok: true, event, score: state.scores[country.code] };
}

function addPaidEvent(voterId, country, user, label, amount, id, multiplier = 1) {
  const points = PAID_POINTS * Math.max(1, multiplier);
  return acceptVote(country, voterId, 'youtube', points, { id, user, label, amount });
}

function hasYoutubeCredentials() {
  return Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REFRESH_TOKEN);
}

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    `${PUBLIC_URL.replace(/\/$/, '')}/oauth2/callback`
  );
}

function youtubeClient() {
  if (!hasYoutubeCredentials()) return null;
  const auth = oauthClient();
  auth.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  return google.youtube({ version: 'v3', auth });
}

async function findLiveChatId(youtube) {
  lastDiscoveryAt = Date.now();
  const fields = 'items(id,snippet(liveChatId),status(lifeCycleStatus))';
  if (process.env.YOUTUBE_BROADCAST_ID) {
    const response = await youtube.liveBroadcasts.list({
      part: 'id,snippet,status',
      id: [process.env.YOUTUBE_BROADCAST_ID],
      fields
    });
    const broadcast = response.data.items?.[0];
    if (!broadcast) throw new Error('Configured YOUTUBE_BROADCAST_ID was not found.');
    if (broadcast.status?.lifeCycleStatus !== 'live') return null;
    if (!broadcast.snippet?.liveChatId) return null;
    return { broadcastId: broadcast.id, liveChatId: broadcast.snippet.liveChatId };
  }
  const response = await youtube.liveBroadcasts.list({
    part: 'id,snippet,status',
    mine: true,
    broadcastStatus: 'active',
    maxResults: 5,
    fields
  });
  const live = (response.data.items || []).find((broadcast) => broadcast.status?.lifeCycleStatus === 'live' && broadcast.snippet?.liveChatId);
  return live ? { broadcastId: live.id, liveChatId: live.snippet.liveChatId } : null;
}

function messageUser(item) {
  return item.authorDetails?.displayName || 'Viewer';
}

function messageVoterId(item) {
  return item.authorDetails?.channelId || item.snippet?.authorChannelId || item.id;
}

function messageText(item) {
  const snippet = item.snippet || {};
  return snippet.textMessageDetails?.messageText || snippet.displayMessage || '';
}

function countryForPaidEvent(item, voterId) {
  const snippet = item.snippet || {};
  const candidateText = snippet.superChatDetails?.userComment || snippet.displayMessage || '';
  return normalizeCountryInput(candidateText) || normalizeCountryInput(lastCountryByVoter.get(voterId));
}

function processYoutubeMessage(item) {
  const snippet = item.snippet || {};
  const type = snippet.type;
  const id = item.id;
  const voterId = messageVoterId(item);
  const user = messageUser(item);

  if (type === 'giftEvent') {
    const combo = Number(snippet.giftEventDetails?.giftMetadata?.comboCount || 1);
    const previous = giftComboCounts.get(id) || 0;
    if (combo <= previous) return false;
    giftComboCounts.set(id, combo);
    const country = countryForPaidEvent(item, voterId);
    if (!country) return false;
    addPaidEvent(voterId, country, user, 'GIFT', 'YouTube Gift', id, combo - previous);
    return true;
  }

  if (processedMessageIds.has(id)) return false;
  processedMessageIds.add(id);
  if (processedMessageIds.size > 12000) {
    const first = processedMessageIds.values().next().value;
    processedMessageIds.delete(first);
  }

  if (type === 'textMessageEvent') {
    const country = normalizeCountryInput(messageText(item));
    if (!country) return false;
    acceptVote(country, voterId, 'youtube', COMMENT_POINTS, { id, user, label: 'COMMENT' });
    return true;
  }

  if (type === 'superChatEvent' || type === 'superStickerEvent') {
    const country = countryForPaidEvent(item, voterId);
    if (!country) {
      rememberEvent({ id, kind: 'paid', source: 'youtube', user, country: null, points: 0, label: type === 'superChatEvent' ? 'SUPER CHAT' : 'SUPER STICKER', amount: snippet.superChatDetails?.amountDisplayString || snippet.superStickerDetails?.amountDisplayString || null, at: new Date().toISOString() });
      emitSnapshot();
      return false;
    }
    const details = snippet.superChatDetails || snippet.superStickerDetails;
    addPaidEvent(voterId, country, user, type === 'superChatEvent' ? 'SUPER CHAT' : 'SUPER STICKER', details?.amountDisplayString || null, id);
    return true;
  }

  if (type === 'membershipGiftingEvent') {
    const country = countryForPaidEvent(item, voterId);
    const count = Number(snippet.membershipGiftingDetails?.giftMembershipsCount || 1);
    if (!country) return false;
    addPaidEvent(voterId, country, user, `MEMBERSHIP ×${count}`, 'Gift Memberships', id, count);
    return true;
  }

  return false;
}

async function pollYoutube() {
  if (!hasYoutubeCredentials()) {
    state.youtube.connected = false;
    state.youtube.live = false;
    state.youtube.lastError = 'YouTube OAuth credentials are not configured; running in demo/static mode.';
    emitSnapshot();
    return;
  }
  const youtube = youtubeClient();
  if (!youtube) return;

  let pageToken;
  let liveChatId = null;
  let broadcastId = null;
  let backoffMs = 0;

  while (!youtubeStopRequested) {
    try {
      if (!liveChatId) {
        const now = Date.now();
        if (now - lastDiscoveryAt < DISCOVERY_MS) {
          await sleep(Math.min(DISCOVERY_MS - (now - lastDiscoveryAt), 5000));
          continue;
        }
        const live = await findLiveChatId(youtube);
        if (!live) {
          state.youtube.connected = true;
          state.youtube.live = false;
          state.youtube.broadcastId = null;
          state.youtube.liveChatId = null;
          state.youtube.lastError = null;
          state.youtube.nextPollMs = DISCOVERY_MS;
          emitSnapshot();
          await sleep(DISCOVERY_MS);
          continue;
        }
        liveChatId = live.liveChatId;
        broadcastId = live.broadcastId;
        pageToken = undefined;
        backoffMs = 0;
      }

      const response = await youtube.liveChatMessages.list({
        liveChatId,
        part: 'id,snippet,authorDetails',
        maxResults: 2000,
        ...(pageToken ? { pageToken } : {}),
        fields: 'nextPageToken,pollingIntervalMillis,offlineAt,items(id,snippet(type,displayMessage,textMessageDetails(messageText),authorChannelId,publishedAt,superChatDetails(amountDisplayString,amountMicros,currency,userComment,tier),superStickerDetails(amountDisplayString,amountMicros,currency,tier),membershipGiftingDetails(giftMembershipsCount),giftEventDetails(giftMetadata(comboCount,giftName,jewelsAmount))),authorDetails(channelId,displayName,profileImageUrl))'
      });

      state.youtube.connected = true;
      state.youtube.live = true;
      state.youtube.broadcastId = broadcastId;
      state.youtube.liveChatId = liveChatId;
      state.youtube.lastError = null;
      state.youtube.lastMessageAt = new Date().toISOString();
      for (const item of response.data.items || []) processYoutubeMessage(item);
      pageToken = response.data.nextPageToken;
      const serverPollMs = Number(response.data.pollingIntervalMillis || 5000);
      const wait = Math.max(MIN_POLL_MS, serverPollMs);
      state.youtube.nextPollMs = wait;
      backoffMs = 0;
      emitSnapshot();
      await sleep(wait);
    } catch (error) {
      const reason = error?.response?.data?.error?.message || error?.message || String(error);
      const lower = reason.toLowerCase();
      const chatEnded = lower.includes('livechatended') || lower.includes('live chat has ended') || lower.includes('livechatnotfound') || lower.includes('live chat is not enabled') || lower.includes('offline');
      const rateLimited = lower.includes('ratelimitexceeded') || lower.includes('quotaexceeded') || lower.includes('resource_exhausted');
      if (chatEnded) {
        liveChatId = null;
        broadcastId = null;
        pageToken = undefined;
        state.youtube.connected = true;
        state.youtube.live = false;
        state.youtube.broadcastId = null;
        state.youtube.liveChatId = null;
        state.youtube.lastError = reason;
        state.youtube.nextPollMs = DISCOVERY_MS;
        emitSnapshot();
        await sleep(DISCOVERY_MS);
      } else {
        backoffMs = Math.min(300000, Math.max(30000, backoffMs ? backoffMs * 2 : 30000));
        state.youtube.connected = false;
        state.youtube.live = Boolean(liveChatId);
        state.youtube.lastError = rateLimited ? `YouTube rate/quota limit; backing off for ${Math.round(backoffMs / 1000)}s.` : reason;
        state.youtube.nextPollMs = backoffMs;
        emitSnapshot();
        await sleep(backoffMs);
      }
    }
  }
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function startYoutubeLoop() {
  if (youtubeLoopRunning) return;
  youtubeLoopRunning = true;
  youtubeStopRequested = false;
  pollYoutube().finally(() => { youtubeLoopRunning = false; });
}

app.get('/api/state', (_req, res) => res.json(snapshot()));
app.get('/api/all-state', (_req, res) => res.json(snapshot()));
app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime(), youtube: state.youtube }));
app.get('/api/config', (_req, res) => res.json({ demoMode: DEMO_MODE, cooldownMs: COOLDOWN_MS, commentPoints: COMMENT_POINTS, paidPoints: PAID_POINTS, minPollMs: MIN_POLL_MS, discoveryMs: DISCOVERY_MS, countryCount: COUNTRIES.length, youtubeConfigured: hasYoutubeCredentials() }));
app.post('/api/demo-vote', (req, res) => {
  if (!DEMO_MODE) return res.status(403).json({ ok: false, error: 'Demo mode is disabled.' });
  const country = normalizeCountryInput(req.body?.country || req.body?.message);
  const result = acceptVote(country, `demo-${crypto.randomUUID()}`, 'demo', COMMENT_POINTS, { user: 'Demo Viewer', label: 'COMMENT' });
  res.status(result.ok ? 200 : 400).json(result);
});
app.post('/api/reset', async (_req, res) => {
  for (const country of COUNTRIES) state.scores[country.code] = 0;
  state.totalPoints = 0; state.totalVotes = 0; state.acceptedVotes = 0; state.rejectedVotes = 0; state.lastEvent = null; state.recentEvents = []; state.supporters = [];
  seenVoters.clear(); cooldowns.clear(); lastCountryByVoter.clear(); processedMessageIds.clear(); giftComboCounts.clear();
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
httpServer.listen(PORT, () => {
  console.log(`FlagsBattle Live Country Battle: ${PUBLIC_URL}`);
  console.log(`Demo mode: ${DEMO_MODE}`);
  console.log(`YouTube configured: ${hasYoutubeCredentials()}`);
  console.log(`YouTube minimum poll: ${MIN_POLL_MS}ms; discovery: ${DISCOVERY_MS}ms`);
});
