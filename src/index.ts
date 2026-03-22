import { BingoRoom } from './bingo-room';

export { BingoRoom };

export interface Env {
  BINGO_ROOM: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/create') {
      const roomCode = generateRoomCode();
      const id = env.BINGO_ROOM.idFromName(roomCode);
      const stub = env.BINGO_ROOM.get(id);
      // Initialize the room
      const initUrl = new URL(request.url);
      initUrl.pathname = '/init';
      initUrl.searchParams.set('code', roomCode);
      await stub.fetch(initUrl.toString());
      return Response.json({ roomCode });
    }

    if (url.pathname === '/api/ws') {
      const roomCode = url.searchParams.get('room');
      if (!roomCode) {
        return Response.json({ error: 'Room code required' }, { status: 400 });
      }
      const id = env.BINGO_ROOM.idFromName(roomCode.toUpperCase());
      const stub = env.BINGO_ROOM.get(id);
      return stub.fetch(request);
    }

    // Static assets are served automatically by wrangler [assets]
    return new Response('Not Found', { status: 404 });
  },
};

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
