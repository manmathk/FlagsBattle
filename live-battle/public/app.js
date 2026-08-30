import { COUNTRIES } from './countries.js';

const socket = io({ transports: ['websocket', 'polling'] });
const $ = (id) => document.getElementById(id);
const leaderboardEl = $('leaderboard');
const toastEl = $('voteToast');
const statusPill = $('statusPill');
const battleA = $('battleA');
const battleB = $('battleB');
const difference = $('difference');
const totalVotesEl = $('totalVotes');
const uniqueVotersEl = $('uniqueVoters');
const countryCountEl = $('countryCount');
let lastRanks = new Map();
let toastTimer = null;

function formatNumber(value) { return new Intl.NumberFormat('en-US').format(value || 0); }
function countryFlag(country) { return country?.flag || '🌐'; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }

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
  renderBattle(state.leaderboard);
  renderLeaderboard(state.leaderboard);
  totalVotesEl.textContent = formatNumber(state.totalVotes);
  uniqueVotersEl.textContent = formatNumber(state.uniqueVoters);
  countryCountEl.textContent = formatNumber(state.countryCount);
  const connected = state.youtube?.live || state.youtube?.connected;
  statusPill.textContent = state.youtube?.live ? 'YOUTUBE LIVE' : connected ? 'SERVER READY' : 'DEMO / OFFLINE';
  statusPill.className = `status-pill ${state.youtube?.live ? 'good' : connected ? 'warm' : 'neutral'}`;
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
    button.disabled = true;
    await fetch('/api/demo-vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ country: button.dataset.code }) });
    setTimeout(() => { button.disabled = false; }, 150);
  }));
}
