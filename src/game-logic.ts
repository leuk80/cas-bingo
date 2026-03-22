import { BINGO_WORDS } from './bingo-words';

export interface Player {
  name: string;
  card: string[][];
  marked: boolean[][];
}

export interface RoomState {
  version: number;
  roomCode: string;
  hostId: string;
  players: Record<string, Player>;
  calledWords: string[];
  gameStarted: boolean;
  winner: string | null;
}

export interface ActionResult {
  state: RoomState;
  response: Record<string, unknown>;
}

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function createRoom(roomCode: string, hostId: string, hostName: string): RoomState {
  return {
    version: 1,
    roomCode,
    hostId,
    players: {
      [hostId]: { name: hostName, card: [], marked: [] },
    },
    calledWords: [],
    gameStarted: false,
    winner: null,
  };
}

export function generateCard(): string[][] {
  const words = [...BINGO_WORDS];
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }
  const selected = words.slice(0, 24);
  const card: string[][] = [];
  let idx = 0;
  for (let r = 0; r < 5; r++) {
    const row: string[] = [];
    for (let c = 0; c < 5; c++) {
      if (r === 2 && c === 2) {
        row.push('★');
      } else {
        row.push(selected[idx++]);
      }
    }
    card.push(row);
  }
  return card;
}

export function checkBingo(marked: boolean[][]): boolean {
  for (let r = 0; r < 5; r++) {
    if (marked[r].every(v => v)) return true;
  }
  for (let c = 0; c < 5; c++) {
    if (marked.every(row => row[c])) return true;
  }
  if ([0, 1, 2, 3, 4].every(i => marked[i][i])) return true;
  if ([0, 1, 2, 3, 4].every(i => marked[i][4 - i])) return true;
  return false;
}

export function handleAction(
  state: RoomState,
  action: { type: string; playerId: string; [key: string]: unknown }
): ActionResult {
  switch (action.type) {
    case 'join':
      return handleJoin(state, action.playerId, action.name as string);
    case 'start':
      return handleStart(state, action.playerId);
    case 'call-word':
      return handleCallWord(state, action.playerId);
    case 'mark':
      return handleMark(state, action.playerId, action.row as number, action.col as number);
    case 'reset':
      return handleReset(state, action.playerId);
    default:
      return { state, response: { error: 'Unknown action' } };
  }
}

function handleJoin(state: RoomState, playerId: string, name: string): ActionResult {
  if (state.winner) {
    return { state, response: { error: 'Das Spiel ist bereits beendet.' } };
  }
  if (state.gameStarted && !state.players[playerId]) {
    return { state, response: { error: 'Das Spiel läuft bereits.' } };
  }

  if (!state.players[playerId]) {
    state.players[playerId] = { name: name || 'Spieler', card: [], marked: [] };
    state.version++;
  }

  return { state, response: { ok: true } };
}

function handleStart(state: RoomState, playerId: string): ActionResult {
  if (playerId !== state.hostId) {
    return { state, response: { error: 'Nur der Host kann das Spiel starten.' } };
  }
  if (Object.keys(state.players).length < 1) {
    return { state, response: { error: 'Warte auf Spieler.' } };
  }

  state.gameStarted = true;
  state.calledWords = [];
  state.winner = null;

  for (const pid of Object.keys(state.players)) {
    const card = generateCard();
    const marked = Array.from({ length: 5 }, () => Array(5).fill(false));
    marked[2][2] = true;
    state.players[pid].card = card;
    state.players[pid].marked = marked;
  }

  state.version++;
  return { state, response: { ok: true } };
}

function handleCallWord(state: RoomState, playerId: string): ActionResult {
  if (playerId !== state.hostId) {
    return { state, response: { error: 'Nur der Host kann Wörter aufrufen.' } };
  }
  if (!state.gameStarted || state.winner) {
    return { state, response: { error: 'Spiel nicht aktiv.' } };
  }

  const remaining = BINGO_WORDS.filter(w => !state.calledWords.includes(w));
  if (remaining.length === 0) {
    return { state, response: { error: 'Alle Wörter wurden aufgerufen!' } };
  }

  const word = remaining[Math.floor(Math.random() * remaining.length)];
  state.calledWords.push(word);
  state.version++;

  return { state, response: { ok: true, word } };
}

function handleMark(state: RoomState, playerId: string, row: number, col: number): ActionResult {
  if (!state.gameStarted || state.winner) {
    return { state, response: { error: 'Spiel nicht aktiv.' } };
  }

  const player = state.players[playerId];
  if (!player || !player.card.length) {
    return { state, response: { error: 'Spieler nicht gefunden.' } };
  }

  if (row < 0 || row > 4 || col < 0 || col > 4) {
    return { state, response: { error: 'Ungültiges Feld.' } };
  }
  if (row === 2 && col === 2) {
    return { state, response: { error: 'Freifeld.' } };
  }

  const word = player.card[row][col];
  if (!state.calledWords.includes(word)) {
    return { state, response: { error: 'Dieses Wort wurde noch nicht aufgerufen.' } };
  }

  player.marked[row][col] = true;
  state.version++;

  if (checkBingo(player.marked)) {
    state.winner = player.name;
  }

  return { state, response: { ok: true, winner: state.winner } };
}

function handleReset(state: RoomState, playerId: string): ActionResult {
  if (playerId !== state.hostId) {
    return { state, response: { error: 'Nur der Host kann das Spiel zurücksetzen.' } };
  }

  state.gameStarted = false;
  state.calledWords = [];
  state.winner = null;
  for (const pid of Object.keys(state.players)) {
    state.players[pid].card = [];
    state.players[pid].marked = [];
  }
  state.version++;

  return { state, response: { ok: true } };
}

export function getPlayerView(state: RoomState, playerId: string) {
  const player = state.players[playerId];
  const playerList = Object.entries(state.players).map(([id, p]) => ({
    id,
    name: p.name,
  }));

  return {
    version: state.version,
    roomCode: state.roomCode,
    isHost: playerId === state.hostId,
    players: playerList,
    gameStarted: state.gameStarted,
    card: player?.card || [],
    marked: player?.marked || [],
    calledWords: state.calledWords,
    currentWord: state.calledWords.length > 0 ? state.calledWords[state.calledWords.length - 1] : null,
    winner: state.winner,
  };
}
