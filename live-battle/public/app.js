import { COUNTRIES } from './countries.js';

const socket = io({ transports: ['websocket', 'polling'] });
const $ = (id) => document.getElementById(id);
const leaderboardEl = $('leaderboard');
const toastEl = $('voteToast');
const winnerToastEl = $('winnerToast');
const statusPill = $('statusPill');
const battleA = $('battleA');
const battleB = $('battleB');
const difference = $('difference');
const totalVotesEl = $('totalVotes');
const uniqueVotersEl = $('uniqueVoters');
const countryCountEl = $('countryCount');
const voiceToggle = $('voiceToggle');
let lastRanks = new Map();
let lastLeaderCode = null;
let hasRenderedInitialState = false;
let toastTimer = null;
let winnerTimer = null;
let voiceEnabled = true;
let voices = [];
let audioUnlocked = false;
let speechQueue = Promise.resolve();

function formatNumber(value) { return new Intl.NumberFormat('en-US').format(value || 0); }
function countryFlag(country) { return country?.flag || '🌐'; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }

function loadVoicePreference() {
  try {
    const saved = localStorage.getItem('flagsbattle-voice');
    voiceEnabled = saved !== 'off';
  } catch { voiceEnabled = true; }
  updateVoiceButton();
}
function updateVoiceButton() {
  if (!voiceToggle) return;
  voiceToggle.textContent = voiceEnabled ? '🔊 VOICE ON' : '🔇 VOICE OFF';
  voiceToggle.classList.toggle('active', voiceEnabled);
  voiceToggle.setAttribute('aria-pressed', String(voiceEnabled));
}
function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  voices = window.speechSynthesis.getVoices();
}
function chooseVoice() {
  const english = voices.filter((voice) => /^en(-|_)/i.test(voice.lang));
  return english.find((voice) => /Google|Microsoft|Samantha|Daniel|Karen|Alex/i.test(voice.name)) || english[0] || voices[0];
}

function fallbackSpeech(text) {
  if (!('speechSynthesis' in window)) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.88;
      utterance.pitch = 1.02;
      utterance.volume = 1;
      const voice = chooseVoice();
      if (voice) utterance.voice = voice;
      utterance.onend = () => resolve(true);
      utterance.onerror = () => resolve(false);
      window.speechSynthesis.speak(utterance);
    } catch { resolve(false); }
  });
}

function remoteTts(text) {
  // StreamElements provides an MP3 speech endpoint. Using an actual audio file
  // makes the announcement much more reliable in OBS Browser Source than
  // relying only on SpeechSynthesis/CEF voices.
  const url = `https://api.streamelements.com/kappa/v2/speech?voice=Brian&text=${encodeURIComponent(text)}`;
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = 1;
    let settled = false;
    const finish = (ok) => { if (!settled) { settled = true; resolve(ok); } };
    audio.onended = () => finish(true);
    audio.onerror = () => finish(false);
    audio.onabort = () => finish(false);
    audio.src = url;
    const play = audio.play();
    if (play?.catch) play.catch(() => finish(false));
    setTimeout(() => finish(false), 12000);
  });
}

function speakWinner(country) {
  if (!voiceEnabled || !country) return;
  const message = `New number one! ${country.name} is now in first place!`;
  speechQueue = speechQueue.then(async () => {
    if (!voiceEnabled) return;
    const remoteWorked = await remoteTts(message);
    if (!remoteWorked) await fallbackSpeech(message);
  }).catch(() => {});
}

function unlockVoice() {
  audioUnlocked = true;
  if ('speechSynthesis' in window) loadVoices();
  updateVoiceButton();
}

function announceWinner(country) {
  if (!country) return;
  winnerToastEl.innerHTML = `<span class="winner-crown">🏆</span><div><small>NEW #1</small><b>${countryFlag(country)} ${escapeHtml(country.name)}</b><em>TAKES THE LEAD!</em></div>`;
  winnerToastEl.classList.remove('show');
  void winnerToastEl.offsetWidth;
  winnerToastEl.classList.add('show');
  clearTimeout(winnerTimer);
  winnerTimer = setTimeout(() => winnerToastEl.classList.remove('show'), 4200);
  speakWinner(country);
}

function renderBattle(rows) {
  const a = rows[0], b = rows[1];
  if (!a) return;
  battleA.innerHTML = `<div class="battle-country"><span>${countryFlag(a)}</span><div><b>${escapeHtml(a.name)}</b><strong>${formatNumber(a.score)}</strong></div></div>`;
  battleB.innerHTML = b ? `<div class="battle-country"><span>${countryFlag(b)}</span><div><b>${escapeHtml(b.name)}</b><strong>${formatNumber(b.score)}</strong></div></div>` : '<div class="battle-country empty"><span>🌍</span><div><b>Waiting for #2</b><strong>—</strong></div></div>';
  if (b) {
    const gap = Math.abs(a.score - b.score);
    difference.textContent = gap === 0 ? 'TIED — EVERY VOTE MATTERS!' : `${formatNumber(gap)} VOTE${gap === 1 ? '' : 'S'} APART`;
  }
}

function renderLeaderboard(rows) {
  const previous = lastRanks;
  const nextRanks = new Map(rows.map((country, index) => [country.code, index + 1]));
  leaderboardEl.innerHTML = rows.map((country, index) => {
    const rank = index + 1;
    const oldRank = previous.get(country.code);
    const moved = oldRank && oldRank !== rank ? (oldRank > rank ? 'up' : 'down') : '';
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `<span class="rank-number">${rank}</span>`;
    const max = Math.max(1, rows[0]?.score || 1);
    const percent = Math.max(3, Math.min(100, (country.score / max) * 100));
    return `<article class="row ${moved}" data-code="${country.code}">
      <div class="rank">${medal}</div>
      <div class="flag">${countryFlag(country)}</div>
      <div class="country-name"><strong>${escapeHtml(country.name)}</strong><small>#${country.number} · ${country.code}</small></div>
      <div class="bar"><i style="width:${percent}%"></i></div>
      <div class="score">${formatNumber(country.score)}</div>
      <div class="delta">${moved === 'up' ? '▲' : moved === 'down' ? '▼' : ''}</div>
    </article>`;
  }).join('');
  requestAnimationFrame(() => leaderboardEl.querySelectorAll('.row.up').forEach((row) => row.classList.add('settle')));
  lastRanks = nextRanks;
}

function render(state) {
  const rows = state.leaderboard || [];
  const newLeader = rows[0];
  renderBattle(rows);
  renderLeaderboard(rows);
  totalVotesEl.textContent = formatNumber(state.totalVotes);
  uniqueVotersEl.textContent = formatNumber(state.uniqueVoters);
  countryCountEl.textContent = formatNumber(state.countryCount);
  const connected = state.youtube?.live || state.youtube?.connected;
  statusPill.textContent = state.youtube?.live ? 'YOUTUBE LIVE' : connected ? 'SERVER READY' : 'DEMO / OFFLINE';
  statusPill.className = `status-pill ${state.youtube?.live ? 'good' : connected ? 'warm' : 'neutral'}`;

  if (hasRenderedInitialState && newLeader && newLeader.code !== lastLeaderCode) announceWinner(newLeader);
  if (newLeader) lastLeaderCode = newLeader.code;
  hasRenderedInitialState = true;
}

function showVote(vote) {
  if (!vote?.country) return;
  toastEl.innerHTML = `<span>${countryFlag(vote.country)}</span><div><small>+1 VOTE</small><b>${escapeHtml(vote.country.name)}</b><em>${formatNumber(vote.score)}</em></div>`;
  toastEl.classList.remove('show');
  void toastEl.offsetWidth;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2300);
}

voiceToggle?.addEventListener('click', () => {
  voiceEnabled = !voiceEnabled;
  try { localStorage.setItem('flagsbattle-voice', voiceEnabled ? 'on' : 'off'); } catch {}
  unlockVoice();
  updateVoiceButton();
  if (voiceEnabled) {
    speechQueue = speechQueue.then(() => remoteTts('Voice announcements are on.')).then((ok) => ok || fallbackSpeech('Voice announcements are on.')).catch(() => {});
  } else if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
});

// Any interaction unlocks audio for browsers/OBS configurations that require
// a user gesture before playing remote audio.
document.addEventListener('pointerdown', unlockVoice, { once: true, passive: true });
document.addEventListener('keydown', unlockVoice, { once: true, passive: true });

loadVoicePreference();
loadVoices();
if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = loadVoices;

socket.on('connect', () => { statusPill.textContent = 'CONNECTED'; statusPill.className = 'status-pill good'; });
socket.on('disconnect', () => { statusPill.textContent = 'RECONNECTING'; statusPill.className = 'status-pill warm'; });
socket.on('state', render);
socket.on('vote', showVote);
fetch('/api/state').then((r) => r.json()).then(render).catch(() => {});

const demoPanel = $('demoPanel');
const demoCountries = $('demoCountries');
const demoSearch = $('demoSearch');
if (new URLSearchParams(location.search).get('demo') === '1') { demoPanel.classList.remove('hidden'); renderDemoCountries(); }
$('closeDemo')?.addEventListener('click', () => demoPanel.classList.add('hidden'));
demoSearch?.addEventListener('input', renderDemoCountries);

function renderDemoCountries() {
  if (!demoCountries) return;
  const query = demoSearch.value.trim().toLowerCase();
  demoCountries.innerHTML = COUNTRIES.filter((c) => !query || c.name.toLowerCase().includes(query) || c.code.toLowerCase() === query || String(c.number) === query).slice(0, 80)
    .map((c) => `<button data-code="${c.code}">${c.flag} <span>${escapeHtml(c.name)}</span><small>#${c.number}</small></button>`).join('');
  demoCountries.querySelectorAll('button').forEach((button) => button.addEventListener('click', async () => {
    unlockVoice();
    button.disabled = true;
    await fetch('/api/demo-vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: button.dataset.code }) });
    setTimeout(() => { button.disabled = false; }, 150);
  }));
}
