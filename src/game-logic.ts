import { BINGO_WORDS } from './bingo-words';

export interface Player {
  name: string;
  card: string[][];
  marked: boolean[][];
}

export interface RoomState {
  version: number;
  roomCode: string;
  players: Record<string, Player>;
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

export function createRoom(roomCode: string, creatorId: string, creatorName: string): RoomState {
  return {
    version: 1,
    roomCode,
    players: {
      [creatorId]: { name: creatorName, card: [], marked: [] },
    },
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
      return handleStart(state);
    case 'mark':
      return handleMark(state, action.playerId, action.row as number, action.col as number);
    case 'reset':
      return handleReset(state);
    default:
      return { state, response: { error: 'Unknown action' } };
  }
}

function handleJoin(state: RoomState, playerId: string, name: string): ActionResult {
  if (state.winner) {
    return { state, response: { error: 'The game has already ended.' } };
  }
  if (state.gameStarted && !state.players[playerId]) {
    return { state, response: { error: 'The game is already in progress.' } };
  }

  if (!state.players[playerId]) {
    state.players[playerId] = { name: name || 'Player', card: [], marked: [] };
    state.version++;
  }

  return { state, response: { ok: true } };
}

function handleStart(state: RoomState): ActionResult {
  if (Object.keys(state.players).length < 1) {
    return { state, response: { error: 'Waiting for players.' } };
  }

  state.gameStarted = true;
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

function handleMark(state: RoomState, playerId: string, row: number, col: number): ActionResult {
  if (!state.gameStarted || state.winner) {
    return { state, response: { error: 'Game not active.' } };
  }

  const player = state.players[playerId];
  if (!player || !player.card.length) {
    return { state, response: { error: 'Player not found.' } };
  }

  if (row < 0 || row > 4 || col < 0 || col > 4) {
    return { state, response: { error: 'Invalid cell.' } };
  }
  if (row === 2 && col === 2) {
    return { state, response: { error: 'Free space.' } };
  }

  player.marked[row][col] = true;
  state.version++;

  if (checkBingo(player.marked)) {
    state.winner = player.name;
  }

  return { state, response: { ok: true, winner: state.winner } };
}

function handleReset(state: RoomState): ActionResult {
  state.gameStarted = false;
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
    players: playerList,
    gameStarted: state.gameStarted,
    card: player?.card || [],
    marked: player?.marked || [],
    winner: state.winner,
  };
}
