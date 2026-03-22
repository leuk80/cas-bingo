import { BINGO_WORDS } from './bingo-words';

interface Player {
  name: string;
  card: string[][];
  marked: boolean[][];
}

interface RoomState {
  roomCode: string;
  hostId: string | null;
  players: Record<string, Player>;
  calledWords: string[];
  gameStarted: boolean;
  winner: string | null;
}

export class BingoRoom implements DurableObject {
  private state: DurableObjectState;
  private sessions: Map<string, WebSocket> = new Map();
  private roomState: RoomState = {
    roomCode: '',
    hostId: null,
    players: {},
    calledWords: [],
    gameStarted: false,
    winner: null,
  };

  constructor(state: DurableObjectState) {
    this.state = state;
    this.state.blockConcurrencyWhile(async () => {
      const stored = await this.state.storage.get<RoomState>('roomState');
      if (stored) {
        this.roomState = stored;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/init') {
      const code = url.searchParams.get('code');
      if (code) {
        this.roomState.roomCode = code;
        await this.saveState();
      }
      return new Response('OK');
    }

    // WebSocket upgrade
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const playerId = crypto.randomUUID();
    this.sessions.set(playerId, server);

    server.accept();

    server.addEventListener('message', (event) => {
      this.handleMessage(playerId, event.data as string);
    });

    server.addEventListener('close', () => {
      this.handleDisconnect(playerId);
    });

    server.addEventListener('error', () => {
      this.handleDisconnect(playerId);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleMessage(playerId: string, raw: string) {
    try {
      const msg = JSON.parse(raw);

      switch (msg.type) {
        case 'join':
          await this.handleJoin(playerId, msg.name);
          break;
        case 'start':
          await this.handleStart(playerId);
          break;
        case 'call-word':
          await this.handleCallWord(playerId);
          break;
        case 'mark':
          await this.handleMark(playerId, msg.row, msg.col);
          break;
        case 'reset':
          await this.handleReset(playerId);
          break;
      }
    } catch (e) {
      this.send(playerId, { type: 'error', message: 'Invalid message' });
    }
  }

  private async handleJoin(playerId: string, name: string) {
    if (this.roomState.winner) {
      this.send(playerId, { type: 'error', message: 'Das Spiel ist bereits beendet.' });
      return;
    }

    const isHost = this.roomState.hostId === null;
    if (isHost) {
      this.roomState.hostId = playerId;
    }

    this.roomState.players[playerId] = {
      name: name || 'Spieler',
      card: [],
      marked: [],
    };

    await this.saveState();
    this.broadcastRoomInfo();
  }

  private async handleStart(playerId: string) {
    if (playerId !== this.roomState.hostId) {
      this.send(playerId, { type: 'error', message: 'Nur der Host kann das Spiel starten.' });
      return;
    }

    const playerCount = Object.keys(this.roomState.players).length;
    if (playerCount < 1) {
      this.send(playerId, { type: 'error', message: 'Warte auf Spieler.' });
      return;
    }

    this.roomState.gameStarted = true;
    this.roomState.calledWords = [];
    this.roomState.winner = null;

    // Generate unique cards for each player
    for (const pid of Object.keys(this.roomState.players)) {
      const card = this.generateCard();
      const marked = Array.from({ length: 5 }, () => Array(5).fill(false));
      marked[2][2] = true; // Free space
      this.roomState.players[pid].card = card;
      this.roomState.players[pid].marked = marked;
    }

    await this.saveState();

    // Send each player their card
    for (const pid of Object.keys(this.roomState.players)) {
      const player = this.roomState.players[pid];
      this.send(pid, {
        type: 'game-started',
        card: player.card,
        marked: player.marked,
      });
    }
  }

  private async handleCallWord(playerId: string) {
    if (playerId !== this.roomState.hostId) {
      this.send(playerId, { type: 'error', message: 'Nur der Host kann Wörter aufrufen.' });
      return;
    }

    if (!this.roomState.gameStarted || this.roomState.winner) return;

    // Find uncalled words
    const allWords = BINGO_WORDS.filter(w => !this.roomState.calledWords.includes(w));
    if (allWords.length === 0) {
      this.broadcast({ type: 'error', message: 'Alle Wörter wurden aufgerufen!' });
      return;
    }

    const word = allWords[Math.floor(Math.random() * allWords.length)];
    this.roomState.calledWords.push(word);

    await this.saveState();

    this.broadcast({
      type: 'word-called',
      word,
      calledWords: this.roomState.calledWords,
    });
  }

  private async handleMark(playerId: string, row: number, col: number) {
    if (!this.roomState.gameStarted || this.roomState.winner) return;

    const player = this.roomState.players[playerId];
    if (!player || !player.card.length) return;

    if (row < 0 || row > 4 || col < 0 || col > 4) return;
    if (row === 2 && col === 2) return; // Free space already marked

    const word = player.card[row][col];
    if (!this.roomState.calledWords.includes(word)) {
      this.send(playerId, { type: 'error', message: 'Dieses Wort wurde noch nicht aufgerufen.' });
      return;
    }

    player.marked[row][col] = true;
    await this.saveState();

    this.send(playerId, {
      type: 'marked',
      row,
      col,
      marked: player.marked,
    });

    // Check for bingo
    if (this.checkBingo(player.marked)) {
      this.roomState.winner = player.name;
      await this.saveState();
      this.broadcast({
        type: 'bingo',
        winner: player.name,
      });
    }
  }

  private async handleReset(playerId: string) {
    if (playerId !== this.roomState.hostId) {
      this.send(playerId, { type: 'error', message: 'Nur der Host kann das Spiel zurücksetzen.' });
      return;
    }

    this.roomState.gameStarted = false;
    this.roomState.calledWords = [];
    this.roomState.winner = null;
    for (const pid of Object.keys(this.roomState.players)) {
      this.roomState.players[pid].card = [];
      this.roomState.players[pid].marked = [];
    }

    await this.saveState();
    this.broadcastRoomInfo();
  }

  private handleDisconnect(playerId: string) {
    this.sessions.delete(playerId);
    if (this.roomState.players[playerId]) {
      delete this.roomState.players[playerId];
      if (this.roomState.hostId === playerId) {
        // Transfer host to next player
        const remaining = Object.keys(this.roomState.players);
        this.roomState.hostId = remaining.length > 0 ? remaining[0] : null;
      }
      this.saveState();
      this.broadcastRoomInfo();
    }
  }

  private generateCard(): string[][] {
    const words = [...BINGO_WORDS];
    // Shuffle
    for (let i = words.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [words[i], words[j]] = [words[j], words[i]];
    }

    const selected = words.slice(0, 24); // 25 - 1 free space
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

  private checkBingo(marked: boolean[][]): boolean {
    // Check rows
    for (let r = 0; r < 5; r++) {
      if (marked[r].every(v => v)) return true;
    }
    // Check columns
    for (let c = 0; c < 5; c++) {
      if (marked.every(row => row[c])) return true;
    }
    // Check diagonals
    if ([0, 1, 2, 3, 4].every(i => marked[i][i])) return true;
    if ([0, 1, 2, 3, 4].every(i => marked[i][4 - i])) return true;

    return false;
  }

  private broadcastRoomInfo() {
    const playerList = Object.entries(this.roomState.players).map(([id, p]) => ({
      id,
      name: p.name,
    }));

    for (const [pid] of this.sessions) {
      this.send(pid, {
        type: 'room-info',
        roomCode: this.roomState.roomCode,
        players: playerList,
        isHost: pid === this.roomState.hostId,
        gameStarted: this.roomState.gameStarted,
      });
    }
  }

  private broadcast(msg: Record<string, unknown>) {
    const data = JSON.stringify(msg);
    for (const [, ws] of this.sessions) {
      try {
        ws.send(data);
      } catch {}
    }
  }

  private send(playerId: string, msg: Record<string, unknown>) {
    const ws = this.sessions.get(playerId);
    if (ws) {
      try {
        ws.send(JSON.stringify(msg));
      } catch {}
    }
  }

  private async saveState() {
    await this.state.storage.put('roomState', this.roomState);
  }
}
