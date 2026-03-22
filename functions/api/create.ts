import { generateRoomCode, createRoom } from '../../src/game-logic';

interface Env {
  BINGO_KV: KVNamespace;
}

const KV_TTL = 3600;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body = await context.request.json() as { name: string; playerId: string };
    const { name, playerId } = body;

    if (!name || !playerId) {
      return Response.json({ error: 'Name und playerId erforderlich.' }, { status: 400 });
    }

    const roomCode = generateRoomCode();
    const state = createRoom(roomCode, playerId, name);
    await context.env.BINGO_KV.put(`room:${roomCode}`, JSON.stringify(state), { expirationTtl: KV_TTL });

    return Response.json({ roomCode });
  } catch (e: any) {
    return Response.json({ error: 'Ungültige Anfrage.', detail: e?.message || String(e) }, { status: 400 });
  }
};
