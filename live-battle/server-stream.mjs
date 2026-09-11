import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import { Server as SocketIOServer } from 'socket.io';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { COUNTRIES, normalizeCountryInput } from './public/countries.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const SCORES_FILE = path.join(DATA_DIR, 'scores.json');
const PROTO_FILE = path.join(__dirname, 'proto', 'stream_list.proto');
const PORT = Number(process.env.PORT || 8787);
const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
const COOLDOWN_MS = Math.max(0, Number(process.env.VOTE_COOLDOWN_MS || 12000));
const COMMENT_POINTS = Math.max(1, Number(process.env.COMMENT_POINTS || 1));
const PAID_POINTS = Math.max(1, Number(process.env.PAID_POINTS || 1000));
const DISCOVERY_MS = Math.max(15000, Number(process.env.YOUTUBE_DISCOVERY_MS || 60000));
const DEMO_MODE = String(process.env.DEMO_MODE || 'false').toLowerCase() === 'true';
const RECENT_EVENT_LIMIT = 18;
const SUPPORTER_LIMIT = 12;
const SNAPSHOT_BATCH_MS = 50;

const packageDefinition = protoLoader.loadSync(PROTO_FILE, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const grpcPackage = grpc.loadPackageDefinition(packageDefinition);
const StreamService = grpcPackage.youtube.api.v3.V3DataLiveChatMessageService;

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
  youtube: {
    connected: false, live: false, mode: 'streamList', broadcastId: null,
    liveChatId: null, lastError: null, lastMessageAt: null, nextPollMs: null
  },
};

const seenVoters = new Set();
const cooldowns = new Map();
const lastCountryByVoter = new Map();
const processedMessageIds = new Set();
const giftComboCounts = new Map();
let saveTimer = null;
let snapshotTimer = null;
let youtubeStopRequested = false;
let lastDiscoveryAt = 0;
let oauthState = null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  saveTimer = setTimeout(async () => { saveTimer = null; await persistScores(); }, 500);
}

async function persistScores() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SCORES_FILE, JSON.stringify({
    version: 3, updatedAt: new Date().toISOString(), scores: state.scores,
    totalPoints: state.totalPoints, totalVotes: state.totalVotes, acceptedVotes: state.acceptedVotes,
  }, null, 2));
}

function rankedCountries(limit = COUNTRIES.length) {
  return COUNTRIES.map((country) => ({ ...country, score: state.scores[country.code] || 0 }))
    .sort((a, b) => b.score - a.score || a.number - b.number).slice(0, limit);
}

function snapshot() {
  return {
    leaderboard: rankedCountries(10), countries: rankedCountries(COUNTRIES.length),
    totalPoints: state.totalPoints, totalVotes: state.totalVotes, uniqueVoters: state.uniqueVoters,
    acceptedVotes: state.acceptedVotes, rejectedVotes: state.rejectedVotes, countryCount: COUNTRIES.length,
    lastEvent: state.lastEvent, recentEvents: state.recentEvents, supporters: state.supporters,
    youtube: state.youtube, rules: { commentPoints: COMMENT_POINTS, paidPoints: PAID_POINTS },
  };
}

function emitSnapshotNow() { io.emit('state', snapshot()); }
function scheduleSnapshot() {
  if (snapshotTimer) return;
  snapshotTimer = setTimeout(() => { snapshotTimer = null; emitSnapshotNow(); }, SNAPSHOT_BATCH_MS);
}

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
      scheduleSnapshot();
      return { ok: false, reason: 'cooldown' };
    }
    cooldowns.set(voterId, now);
    if (!seenVoters.has(voterId)) { seenVoters.add(voterId); state.uniqueVoters += 1; }
    lastCountryByVoter.set(voterId, country.code);
  }
  state.scores[country.code] = (state.scores[country.code] || 0) + points;
  state.totalPoints += points;
  if (source === 'youtube' && points < PAID_POINTS) state.totalVotes += 1;
  state.acceptedVotes += 1;
  const event = {
    id: meta.id || crypto.randomUUID(), kind: points >= PAID_POINTS ? 'paid' : 'vote', source,
    user: meta.user || 'Viewer', country: { code: country.code, number: country.number, name: country.name, flag: country.flag },
    points, label: meta.label || (points >= PAID_POINTS ? 'BOOST' : 'COMMENT'), amount: meta.amount || null,
    at: new Date(now).toISOString(),
  };
  rememberEvent(event);
  scheduleSave();
  io.emit('event', event);
  io.emit('vote', { ...event, score: state.scores[country.code], totalPoints: state.totalPoints });
  scheduleSnapshot();
  return { ok: true, event, score: state.scores[country.code] };
}

function addPaidEvent(voterId, country, user, label, amount, id, multiplier = 1) {
  return acceptVote(country, voterId, 'youtube', PAID_POINTS * Math.max(1, multiplier), { id, user, label, amount });
}

function hasYoutubeCredentials() {
  return Boolean(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET && process.env.YOUTUBE_REFRESH_TOKEN);
}

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET,
    `${PUBLIC_URL.replace(/\/$/, '')}/oauth2/callback`,
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
      part: 'id,snippet,status', id: [process.env.YOUTUBE_BROADCAST_ID], fields,
    });
    const broadcast = response.data.items?.[0];
    if (!broadcast) throw new Error('Configured YOUTUBE_BROADCAST_ID was not found.');
    if (broadcast.status?.lifeCycleStatus !== 'live' || !broadcast.snippet?.liveChatId) return null;
    return { broadcastId: broadcast.id, liveChatId: broadcast.snippet.liveChatId };
  }
  const response = await youtube.liveBroadcasts.list({
    part: 'id,snippet,status', mine: true, broadcastStatus: 'active', maxResults: 5, fields,
  });
  const live = (response.data.items || []).find((b) => b.status?.lifeCycleStatus === 'live' && b.snippet?.liveChatId);
  return live ? { broadcastId: live.id, liveChatId: live.snippet.liveChatId } : null;
}

function messageUser(item) { return item.authorDetails?.displayName || 'Viewer'; }
function messageVoterId(item) { return item.authorDetails?.channelId || item.snippet?.authorChannelId || item.id; }
function messageText(item) { return item.snippet?.textMessageDetails?.messageText || item.snippet?.displayMessage || ''; }

function countryForPaidEvent(item, voterId) {
  const s = item.snippet || {};
  const candidateText = s.superChatDetails?.userComment || s.displayMessage || '';
  return normalizeCountryInput(candidateText) || normalizeCountryInput(lastCountryByVoter.get(voterId));
}

function processYoutubeMessage(item) {
  const s = item.snippet || {};
  const type = typeof s.type === 'string' ? s.type : String(s.type || '');
  const id = item.id;
  if (!id) return false;
  const voterId = messageVoterId(item);
  const user = messageUser(item);

  if (type === 'GIFT_EVENT') {
    const combo = Number(s.giftDetails?.comboCount || 1);
    const previous = giftComboCounts.get(id) || 0;
    if (combo <= previous) return false;
    giftComboCounts.set(id, combo);
    const country = countryForPaidEvent(item, voterId);
    if (!country) return false;
    addPaidEvent(voterId, country, user, 'GIFT', s.giftDetails?.giftName || 'YouTube Gift', id, combo - previous);
    return true;
  }

  if (processedMessageIds.has(id)) return false;
  processedMessageIds.add(id);
  if (processedMessageIds.size > 12000) processedMessageIds.delete(processedMessageIds.values().next().value);

  if (type === 'TEXT_MESSAGE_EVENT') {
    const country = normalizeCountryInput(messageText(item));
    if (!country) return false;
    acceptVote(country, voterId, 'youtube', COMMENT_POINTS, { id, user, label: 'COMMENT' });
    return true;
  }

  if (type === 'SUPER_CHAT_EVENT' || type === 'SUPER_STICKER_EVENT') {
    const country = countryForPaidEvent(item, voterId);
    const details = s.superChatDetails || s.superStickerDetails;
    const label = type === 'SUPER_CHAT_EVENT' ? 'SUPER CHAT' : 'SUPER STICKER';
    if (!country) {
      rememberEvent({ id, kind: 'paid', source: 'youtube', user, country: null, points: 0, label,
        amount: details?.amountDisplayString || null, at: new Date().toISOString() });
      scheduleSnapshot();
      return false;
    }
    addPaidEvent(voterId, country, user, label, details?.amountDisplayString || null, id);
    return true;
  }

  if (type === 'MEMBERSHIP_GIFTING_EVENT') {
    const country = countryForPaidEvent(item, voterId);
    const count = Number(s.membershipGiftingDetails?.giftMembershipsCount || 1);
    if (!country) return false;
    addPaidEvent(voterId, country, user, `MEMBERSHIP ×${count}`, 'Gift Memberships', id, count);
    return true;
  }
  return false;
}

function createGrpcClient() {
  return new StreamService('youtube.googleapis.com:443', grpc.credentials.createSsl());
}

async function oauthMetadata() {
  const auth = oauthClient();
  auth.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  const tokenResult = await auth.getAccessToken();
  const token = typeof tokenResult === 'string' ? tokenResult : tokenResult?.token;
  if (!token) throw new Error('Unable to obtain a YouTube OAuth access token.');
  const metadata = new grpc.Metadata();
  metadata.set('authorization', `Bearer ${token}`);
  return metadata;
}

async function consumeStream(client, liveChatId, pageToken, chatStartedAt) {
  const metadata = await oauthMetadata();
  const request = {
    liveChatId,
    part: ['id', 'snippet', 'authorDetails'],
    pageToken: pageToken || undefined,
  };
  return new Promise((resolve, reject) => {
    const stream = client.streamList(request, metadata);
    let nextPageToken = pageToken;
    let messageCount = 0;
    let endedOffline = false;
    stream.on('data', (response) => {
      nextPageToken = response.nextPageToken || nextPageToken;
      if (response.offlineAt) endedOffline = true;
      const items = response.items || [];
      for (const item of items) {
        if (chatStartedAt && item.snippet?.publishedAt && item.snippet.publishedAt < chatStartedAt && !pageToken) continue;
        processYoutubeMessage(item);
        messageCount += 1;
      }
      if (items.length) {
        state.youtube.lastMessageAt = new Date().toISOString();
        scheduleSnapshot();
      }
    });
    stream.on('error', (error) => reject(Object.assign(error, { nextPageToken, messageCount })));
    stream.on('end', () => resolve({ nextPageToken, messageCount, endedOffline }));
  });
}

function isChatEnded(error) {
  const code = error?.code;
  return code === grpc.status.NOT_FOUND || code === grpc.status.FAILED_PRECONDITION;
}

async function streamYoutube() {
  if (!hasYoutubeCredentials()) {
    state.youtube.connected = false;
    state.youtube.live = false;
    state.youtube.lastError = 'YouTube OAuth credentials are not configured; running in demo/static mode.';
    emitSnapshotNow();
    return;
  }

  const youtube = youtubeClient();
  const grpcClient = createGrpcClient();
  let liveChatId = null;
  let broadcastId = null;
  let pageToken = null;
  let chatStartedAt = null;
  let backoffMs = 1000;

  while (!youtubeStopRequested) {
    try {
      if (!liveChatId) {
        const since = Date.now() - lastDiscoveryAt;
        if (since < DISCOVERY_MS) await sleep(Math.min(DISCOVERY_MS - since, 5000));
        const live = await findLiveChatId(youtube);
        if (!live) {
          state.youtube.connected = true;
          state.youtube.live = false;
          state.youtube.broadcastId = null;
          state.youtube.liveChatId = null;
          state.youtube.lastError = null;
          state.youtube.nextPollMs = null;
          emitSnapshotNow();
          await sleep(DISCOVERY_MS);
          continue;
        }
        liveChatId = live.liveChatId;
        broadcastId = live.broadcastId;
        pageToken = null;
        chatStartedAt = new Date().toISOString();
        backoffMs = 1000;
      }

      state.youtube.connected = true;
      state.youtube.live = true;
      state.youtube.broadcastId = broadcastId;
      state.youtube.liveChatId = liveChatId;
      state.youtube.mode = 'streamList';
      state.youtube.nextPollMs = null;
      state.youtube.lastError = null;
      emitSnapshotNow();

      const result = await consumeStream(grpcClient, liveChatId, pageToken, chatStartedAt);
      pageToken = result.nextPageToken || pageToken;
      if (result.endedOffline) throw Object.assign(new Error('Live chat went offline.'), { code: grpc.status.NOT_FOUND });
      backoffMs = 1000;
    } catch (error) {
      const reason = error?.details || error?.message || String(error);
      if (isChatEnded(error) || /live ?chat.*(ended|offline|not found)/i.test(reason)) {
        liveChatId = null;
        broadcastId = null;
        pageToken = null;
        chatStartedAt = null;
        state.youtube.live = false;
        state.youtube.lastError = null;
        emitSnapshotNow();
        await sleep(1000);
        continue;
      }
      state.youtube.connected = false;
      state.youtube.lastError = reason;
      state.youtube.nextPollMs = backoffMs;
      emitSnapshotNow();
      await sleep(backoffMs);
      backoffMs = Math.min(backoffMs * 2, 30000);
    }
  }
  grpcClient.close();
}

app.get('/api/state', (_req, res) => res.json(snapshot()));
app.get('/healthz', (_req, res) => res.json({ ok: true, youtube: state.youtube }));

app.post('/api/demo-vote', (req, res) => {
  if (!DEMO_MODE && req.ip !== '127.0.0.1' && req.ip !== '::1') return res.status(403).json({ ok: false });
  const country = normalizeCountryInput(req.body?.country);
  const result = acceptVote(country, `demo-${crypto.randomUUID()}`, 'demo', COMMENT_POINTS, { user: 'Demo Viewer', label: 'DEMO' });
  res.json(result);
});

app.get('/oauth2/start', (req, res) => {
  if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) return res.status(400).send('Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET first.');
  const auth = oauthClient();
  oauthState = crypto.randomBytes(24).toString('hex');
  const url = auth.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/youtube.readonly'], state: oauthState });
  res.redirect(url);
});

app.get('/oauth2/callback', async (req, res) => {
  try {
    if (!oauthState || req.query.state !== oauthState) return res.status(400).send('Invalid OAuth state.');
    oauthState = null;
    const auth = oauthClient();
    const { tokens } = await auth.getToken(String(req.query.code || ''));
    res.type('html').send(`<h2>Authorization complete</h2><p>Put this refresh token into <code>YOUTUBE_REFRESH_TOKEN</code> and restart:</p><pre>${tokens.refresh_token || '(No refresh token returned; revoke access and authorize again with consent.)'}</pre>`);
  } catch (error) {
    res.status(500).send(`OAuth error: ${error?.message || error}`);
  }
});

io.on('connection', (socket) => socket.emit('state', snapshot()));

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
async function shutdown() {
  youtubeStopRequested = true;
  if (saveTimer) clearTimeout(saveTimer);
  if (snapshotTimer) clearTimeout(snapshotTimer);
  try { await persistScores(); } catch {}
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

await loadScores();
httpServer.listen(PORT, () => console.log(`FlagsBattle live overlay: ${PUBLIC_URL}`));
streamYoutube().catch((error) => {
  state.youtube.connected = false;
  state.youtube.lastError = error?.message || String(error);
  emitSnapshotNow();
  console.error(error);
});
