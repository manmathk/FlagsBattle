import { COUNTRIES } from './countries.js';

const socket = io({ transports: ['websocket', 'polling'] });
const $ = (id) => document.getElementById(id);
const countriesEl = $('countries');
const supportersEl = $('supporters');
const tickerEl = $('boostTicker');
const toastEl = $('eventToast');
const statusEl = $('liveStatus');
const totalPointsEl = $('totalPoints');
const totalVotesEl = $('totalVotes');
const uniqueVotersEl = $('uniqueVoters');
const countryCountEl = $('countryCount');
const voiceToggle = $('voiceToggle');

let lastScores = new Map();
let lastLeader = null;
let initialRender = false;
let toastTimer = null;
let voiceEnabled = true;
let voices = [];
let speechQueue = Promise.resolve();

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(value || 0);
const flag = (country) => country?.flag || '🌐';
const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));

function loadVoices() { if ('speechSynthesis' in window) voices = window.speechSynthesis.getVoices(); }
function chooseVoice() { return voices.find((v) => /^en/i.test(v.lang) && /Google|Microsoft|Samantha|Daniel|Karen|Alex/i.test(v.name)) || voices.find((v) => /^en/i.test(v.lang)) || voices[0]; }
function speak(text) {
  if (!voiceEnabled || !('speechSynthesis' in window)) return;
  speechQueue = speechQueue.then(() => new Promise((resolve) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = .92; u.pitch = 1.02; u.volume = 1;
      const v = chooseVoice(); if (v) u.voice = v;
      u.onend = resolve; u.onerror = resolve;
      window.speechSynthesis.speak(u);
    } catch { resolve(); }
  })).catch(() => {});
}

function renderSupporters(names = []) {
  supportersEl.innerHTML = names.length
    ? names.map((name, i) => `<span class="supporter"><i>${i + 1}</i> @${esc(name)}</span>`).join('')
    : '<span>Waiting for our first booster…</span>';
}

function renderTicker(event) {
  if (!event) return;
  const paid = event.kind === 'paid';
  const user = esc(event.user || 'Viewer');
  const country = event.country;
  const countryText = country ? `${flag(country)} ${esc(country.name)}` : 'a country';
  tickerEl.innerHTML = paid
    ? `<span>⚡</span><b>@${user}</b><em>boosted</em><strong>${countryText}!</strong><small>+${formatNumber(event.points)} points</small>`
    : `<span>💬</span><b>@${user}</b><em>boosted</em><strong>${countryText}!</strong><small>+${formatNumber(event.points)} point</small>`;
  tickerEl.classList.remove('flash'); void tickerEl.offsetWidth; tickerEl.classList.add('flash');
}

function showToast(event) {
  if (!event?.country) return;
  const paid = event.kind === 'paid';
  toastEl.innerHTML = `<span>${flag(event.country)}</span><div><small>${esc(event.label || (paid ? 'BOOST' : 'COMMENT'))}</small><b>${esc(event.user || 'Viewer')}</b><strong>+${formatNumber(event.points)}</strong></div>`;
  toastEl.classList.remove('show'); void toastEl.offsetWidth; toastEl.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), paid ? 4200 : 1800);
  if (paid) speak(`${event.user || 'Viewer'} boosted ${event.country.name}`);
}

function renderCountries(rows) {
  const previous = lastScores;
  countriesEl.innerHTML = rows.map((country, index) => {
    const score = Number(country.score || 0);
    const old = previous.get(country.code);
    const changed = old !== undefined && old !== score;
    const leader = index === 0 && score > 0;
    const rank = index + 1;
    return `<article class="country ${leader ? 'leader' : ''} ${changed ? 'changed' : ''}" data-code="${country.code}">
      <div class="country-flag">${flag(country)}</div>
      <div class="country-score">${formatNumber(score)}</div>
      <div class="country-name">${esc(country.name)}</div>
      <div class="country-rank">#${rank}</div>
    </article>`;
  }).join('');
  lastScores = new Map(rows.map((c) => [c.code, Number(c.score || 0)]));
}

function render(state) {
  const rows = state.countries || state.leaderboard || COUNTRIES.map((c) => ({ ...c, score: 0 }));
  renderCountries(rows);
  renderSupporters(state.supporters || []);
  totalPointsEl.textContent = formatNumber(state.totalPoints);
  totalVotesEl.textContent = formatNumber(state.totalVotes);
  uniqueVotersEl.textContent = formatNumber(state.uniqueVoters);
  countryCountEl.textContent = formatNumber(state.countryCount || COUNTRIES.length);
  const live = Boolean(state.youtube?.live);
  const connected = Boolean(state.youtube?.connected);
  statusEl.textContent = live ? '● LIVE' : connected ? '● READY' : '● OFFLINE';
  statusEl.className = live ? 'live' : connected ? 'ready' : 'offline';

  const leader = rows.find((c) => Number(c.score || 0) > 0) || rows[0];
  if (initialRender && leader && leader.code !== lastLeader && Number(leader.score || 0) > 0) {
    speak(`${leader.name} is number one`);
  }
  if (leader) lastLeader = leader.code;
  initialRender = true;
  if (state.lastEvent) renderTicker(state.lastEvent);
}

socket.on('connect', () => { statusEl.textContent = '● CONNECTED'; statusEl.className = 'ready'; });
socket.on('disconnect', () => { statusEl.textContent = '● RECONNECTING'; statusEl.className = 'offline'; });
socket.on('state', render);
socket.on('event', (event) => { renderTicker(event); showToast(event); });
fetch('/api/state').then((r) => r.json()).then(render).catch(() => {});

voiceToggle.addEventListener('click', () => {
  voiceEnabled = !voiceEnabled;
  voiceToggle.textContent = voiceEnabled ? '🔊 VOICE' : '🔇 VOICE';
  if (!voiceEnabled && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  if (voiceEnabled) speak('Voice announcements are on');
});

document.addEventListener('pointerdown', () => loadVoices(), { once: true, passive: true });
loadVoices();
if ('speechSynthesis' in window) window.speechSynthesis.onvoiceschanged = loadVoices;

const demoPanel = $('demoPanel');
const demoCountries = $('demoCountries');
const demoSearch = $('demoSearch');
if (new URLSearchParams(location.search).get('demo') === '1') {
  demoPanel.classList.remove('hidden');
  function renderDemo() {
    const q = demoSearch.value.trim().toLowerCase();
    demoCountries.innerHTML = COUNTRIES.filter((c) => !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q || String(c.number) === q).slice(0, 100)
      .map((c) => `<button data-code="${c.code}">${c.flag} ${esc(c.name)}</button>`).join('');
    demoCountries.querySelectorAll('button').forEach((button) => button.addEventListener('click', async () => {
      await fetch('/api/demo-vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: button.dataset.code }) });
    }));
  }
  demoSearch.addEventListener('input', renderDemo);
  $('closeDemo').addEventListener('click', () => demoPanel.classList.add('hidden'));
  renderDemo();
}
