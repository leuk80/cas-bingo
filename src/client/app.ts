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
const lobbyWait = document.getElementById('lobby-wait')!;

const currentWordDisplay = document.getElementById('current-word')!;
const btnCall = document.getElementById('btn-call')!;
const bingoCardEl = document.getElementById('bingo-card')!;
const calledWordsList = document.getElementById('called-words-list')!;
const btnReset = document.getElementById('btn-reset')!;

const bingoOverlay = document.getElementById('bingo-overlay')!;
const bingoWinner = document.getElementById('bingo-winner')!;
const btnCloseOverlay = document.getElementById('btn-close-overlay')!;

// State
let ws: WebSocket | null = null;
let isHost = false;
let myCard: string[][] = [];
let myMarked: boolean[][] = [];
let calledWords: string[] = [];

// View switching
function showView(view: HTMLElement) {
  viewStart.classList.remove('active');
  viewLobby.classList.remove('active');
  viewGame.classList.remove('active');
  view.classList.add('active');
}

// WebSocket connection
function connect(roomCode: string, playerName: string) {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}/api/ws?room=${roomCode}`;

  ws = new WebSocket(wsUrl);

  ws.addEventListener('open', () => {
    ws!.send(JSON.stringify({ type: 'join', name: playerName }));
  });

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    handleServerMessage(msg);
  });

  ws.addEventListener('close', () => {
    // Attempt reconnect after a short delay
    setTimeout(() => {
      if (ws?.readyState === WebSocket.CLOSED) {
        showView(viewStart);
      }
    }, 2000);
  });
}

function handleServerMessage(msg: any) {
  switch (msg.type) {
    case 'room-info':
      handleRoomInfo(msg);
      break;
    case 'game-started':
      handleGameStarted(msg);
      break;
    case 'word-called':
      handleWordCalled(msg);
      break;
    case 'marked':
      handleMarked(msg);
      break;
    case 'bingo':
      handleBingo(msg);
      break;
    case 'error':
      showError(msg.message);
      break;
  }
}

function handleRoomInfo(msg: any) {
  showView(viewLobby);
  roomCodeDisplay.textContent = msg.roomCode;
  isHost = msg.isHost;

  playerList.innerHTML = '';
  for (const player of msg.players) {
    const li = document.createElement('li');
    li.textContent = player.name;
    if (msg.players.indexOf(player) === 0) {
      const badge = document.createElement('span');
      badge.className = 'host-badge';
      badge.textContent = 'Host';
      li.appendChild(badge);
    }
    playerList.appendChild(li);
  }

  btnStart.style.display = isHost ? 'block' : 'none';
  lobbyWait.style.display = isHost ? 'none' : 'block';
}

function handleGameStarted(msg: any) {
  myCard = msg.card;
  myMarked = msg.marked;
  calledWords = [];
  showView(viewGame);
  renderCard();

  btnCall.style.display = isHost ? 'block' : 'none';
  btnReset.style.display = isHost ? 'block' : 'none';
  currentWordDisplay.textContent = '—';
  calledWordsList.innerHTML = '';
}

function handleWordCalled(msg: any) {
  calledWords = msg.calledWords;
  currentWordDisplay.textContent = msg.word;
  renderCalledWords();
  renderCard(); // Update callable highlights
}

function handleMarked(msg: any) {
  myMarked = msg.marked;
  renderCard();
}

function handleBingo(msg: any) {
  bingoWinner.textContent = `${msg.winner} hat gewonnen!`;
  bingoOverlay.classList.add('active');
  createConfetti();
}

function showError(message: string) {
  // Simple inline notification
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
      const isCallable = !isMarked && !isFree && calledWords.includes(myCard[r][c]);

      if (isFree) cell.classList.add('free');
      if (isMarked) cell.classList.add('marked');
      if (isCallable) cell.classList.add('callable');

      if (!isFree && !isMarked) {
        cell.addEventListener('click', () => {
          if (!calledWords.includes(myCard[r][c])) {
            showError('Dieses Wort wurde noch nicht aufgerufen.');
            return;
          }
          ws?.send(JSON.stringify({ type: 'mark', row: r, col: c }));
        });
      }

      bingoCardEl.appendChild(cell);
    }
  }
}

// Render called words list
function renderCalledWords() {
  calledWordsList.innerHTML = '';
  for (const word of calledWords) {
    const chip = document.createElement('span');
    chip.className = 'called-word-chip';
    chip.textContent = word;
    calledWordsList.appendChild(chip);
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

  // Add confetti animation if not present
  if (!document.getElementById('confetti-style')) {
    const style = document.createElement('style');
    style.id = 'confetti-style';
    style.textContent = `
      @keyframes confetti-fall {
        0% { transform: translateY(0) rotate(0deg); opacity: 1; }
        100% { transform: translateY(100vh) rotate(${360 + Math.random() * 360}deg); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
}

// Event Listeners
btnCreate.addEventListener('click', async () => {
  const name = hostNameInput.value.trim();
  if (!name) {
    showError('Bitte gib deinen Namen ein.');
    return;
  }

  try {
    const res = await fetch('/api/create');
    const data = await res.json();
    connect(data.roomCode, name);
  } catch {
    showError('Fehler beim Erstellen des Spiels.');
  }
});

btnJoin.addEventListener('click', () => {
  const code = joinCodeInput.value.trim().toUpperCase();
  const name = joinNameInput.value.trim();

  if (!code || code.length < 4) {
    showError('Bitte gib einen gültigen Raumcode ein.');
    return;
  }
  if (!name) {
    showError('Bitte gib deinen Namen ein.');
    return;
  }

  connect(code, name);
});

btnStart.addEventListener('click', () => {
  ws?.send(JSON.stringify({ type: 'start' }));
});

btnCall.addEventListener('click', () => {
  ws?.send(JSON.stringify({ type: 'call-word' }));
});

btnReset.addEventListener('click', () => {
  ws?.send(JSON.stringify({ type: 'reset' }));
});

btnCloseOverlay.addEventListener('click', () => {
  bingoOverlay.classList.remove('active');
});

// Allow Enter key for inputs
joinCodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnJoin.click();
});

joinNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnJoin.click();
});

hostNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') btnCreate.click();
});
