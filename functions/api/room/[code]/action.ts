import { handleAction, getPlayerView, RoomState } from '../../../../src/game-logic';

interface Env {
  BINGO_KV: KVNamespace;
}

const KV_TTL = 3600;

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const roomCode = (context.params.code as string).toUpperCase();

  try {
    const action = await context.request.json() as { type: string; playerId: string; [key: string]: unknown };

    if (!action.type || !action.playerId) {
      return Response.json({ error: 'type and playerId required.' }, { status: 400 });
    }

    const raw = await context.env.BINGO_KV.get(`room:${roomCode}`);
    if (!raw) {
      return Response.json({ error: 'Room not found.' }, { status: 404 });
    }

    const state: RoomState = JSON.parse(raw);
    const result = handleAction(state, action);

    await context.env.BINGO_KV.put(`room:${roomCode}`, JSON.stringify(result.state), { expirationTtl: KV_TTL });

    const view = getPlayerView(result.state, action.playerId);
    return Response.json({ ...result.response, state: view });
  } catch (e: any) {
    return Response.json({ error: 'Invalid request.', detail: e?.message || String(e) }, { status: 400 });
  }
};
