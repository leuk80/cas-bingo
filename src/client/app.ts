// DOM Elements
const viewStart = document.getElementById('view-start')!;
const viewLobby = document.getElementById('view-lobby')!;
const viewGame = document.getElementById('view-game')!;

const hostNameInput = document.getElementById('host-name') as HTMLInputElement;
const btnCreate = document.getElementById('btn-create')!;
const joinCodeInput = document.getElementById('join-code') as HTMLInputElement;
const joinNameInput = document.getElementById('join-name') as HTMLInputElement;
const btnJoin = document.getElementById('btn-join')!;

const roomCodeDisplay = document.getElementById('room-code')!;
const playerList = document.getElementById('player-list')!;
const btnStart = document.getElementById('btn-start')!;

const bingoCardEl = document.getElementById('bingo-card')!;
const btnReset = document.getElementById('btn-reset')!;

const bingoOverlay = document.getElementById('bingo-overlay')!;
const bingoWinner = document.getElementById('bingo-winner')!;
const btnCloseOverlay = document.getElementById('btn-close-overlay')!;

// State
let playerId = localStorage.getItem('bingo-player-id');
if (!playerId) {
  playerId = crypto.randomUUID();
  localStorage.setItem('bingo-player-id', playerId);
}

let roomCode: string | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let lastVersion = -1;
let myCard: string[][] = [];
let myMarked: boolean[][] = [];
let currentView: 'start' | 'lobby' | 'game' = 'start';
let bingoShown = false;

// View switching
function showView(view: 'start' | 'lobby' | 'game') {
  currentView = view;
  viewStart.classList.toggle('active', view === 'start');
  viewLobby.classList.toggle('active', view === 'lobby');
  viewGame.classList.toggle('active', view === 'game');
}

// API helpers
async function apiPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, playerId }),
  });
  return res.json();
}

async function sendAction(type: string, data: Record<string, unknown> = {}) {
  if (!roomCode) return;
  const result = await apiPost(`/api/room/${roomCode}/action`, { type, ...data });
  if (result.error) {
    showError(result.error);
    return null;
  }
  if (result.state) {
    applyState(result.state);
  }
  return result;
}

// Polling
function startPolling(code: string) {
  roomCode = code;
  stopPolling();
  poll();
  pollInterval = setInterval(poll, 2000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function poll() {
  if (!roomCode || !playerId) return;
  try {
    const res = await fetch(`/api/room/${roomCode}/state?playerId=${playerId}`);
    if (!res.ok) {
      if (res.status === 404) {
        stopPolling();
        showView('start');
        showError('Room not found or expired.');
      }
      return;
    }
    const state = await res.json();
    if (state.version !== lastVersion) {
      applyState(state);
    }
  } catch {
    // Network error, keep polling
  }
}

function applyState(state: any) {
  lastVersion = state.version;

  if (state.winner && !bingoShown) {
    bingoShown = true;
    bingoWinner.textContent = `${state.winner} wins!`;
    bingoOverlay.classList.add('active');
    createConfetti();
  }

  if (state.gameStarted && state.card && state.card.length > 0) {
    myCard = state.card;
    myMarked = state.marked;

    if (currentView !== 'game') {
      showView('game');
      bingoShown = false;
    }

    renderCard();
  } else {
    // Lobby
    if (currentView !== 'lobby' && currentView !== 'start') {
      showView('lobby');
    }
    if (currentView === 'lobby' || currentView === 'start') {
      showView('lobby');
      roomCodeDisplay.textContent = state.roomCode;
      renderPlayerList(state.players);
      bingoShown = false;
    }
  }
}

function renderPlayerList(players: { id: string; name: string }[]) {
  playerList.innerHTML = '';
  for (const player of players) {
    const li = document.createElement('li');
    li.textContent = player.name;
    playerList.appendChild(li);
  }
}

function showError(message: string) {
  const existing = document.querySelector('.error-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'error-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: #ff3b30; color: white; padding: 12px 24px; border-radius: 8px;
    font-size: 14px; font-weight: 500; z-index: 200; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// Render Bingo Card
function renderCard() {
  bingoCardEl.innerHTML = '';
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const cell = document.createElement('div');
      cell.className = 'bingo-cell';
      cell.textContent = myCard[r][c];

      const isFree = r === 2 && c === 2;
      const isMarked = myMarked[r][c];

      if (isFree) cell.classList.add('free');
      if (isMarked) cell.classList.add('marked');

      if (!isFree && !isMarked) {
        cell.addEventListener('click', async () => {
          await sendAction('mark', { row: r, col: c });
        });
      }

      bingoCardEl.appendChild(cell);
    }
  }
}

// Confetti effect
function createConfetti() {
  const colors = ['#667eea', '#764ba2', '#34c759', '#ff9500', '#ff3b30', '#5ac8fa'];
  for (let i = 0; i < 60; i++) {
    const confetti = document.createElement('div');
    confetti.style.cssText = `
      position: fixed;
      width: ${6 + Math.random() * 8}px;
      height: ${6 + Math.random() * 8}px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      left: ${Math.random() * 100}vw;
      top: -10px;
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      z-index: 150;
      pointer-events: none;
      animation: confetti-fall ${2 + Math.random() * 3}s linear forwards;
    `;
    document.body.appendChild(confetti);
    setTimeout(() => confetti.remove(), 5000);
  }

  if (!document.getElementById('confetti-style')) {
    const style = document.createElement('style');
    style.id = 'confetti-style';
    style.textContent = `
      @keyframes confetti-fall {
        0% { transform: translateY(0) rotate(0deg); opacity: 1; }
        100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
}

// Event Listeners
btnCreate.addEventListener('click', async () => {
  const name = hostNameInput.value.trim();
  if (!name) {
    showError('Please enter your name.');
    return;
  }

  try {
    const res = await fetch('/api/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, playerId }),
    });
    const data = await res.json();
    if (data.error) {
      showError(data.detail ? `${data.error} (${data.detail})` : data.error);
      return;
    }
    startPolling(data.roomCode);
  } catch (e: any) {
    showError('Error creating game: ' + (e?.message || ''));
  }
});

btnJoin.addEventListener('click', async () => {
  const code = joinCodeInput.value.trim().toUpperCase();
  const name = joinNameInput.value.trim();

  if (!code || code.length < 4) {
    showError('Please enter a valid room code.');
    return;
  }
  if (!name) {
    showError('Please enter your name.');
    return;
  }

  roomCode = code;
  const result = await apiPost(`/api/room/${code}/action`, { type: 'join', name });
  if (result.error) {
    showError(result.error);
    roomCode = null;
    return;
  }
  startPolling(code);
});

btnStart.addEventListener('click', () => sendAction('start'));
btnReset.addEventListener('click', () => {
  bingoShown = false;
  sendAction('reset');
});

btnCloseOverlay.addEventListener('click', () => {
  bingoOverlay.classList.remove('active');
});

// Enter key support
joinCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnJoin.click();
});
joinNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnJoin.click();
});
hostNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnCreate.click();
});
