import { getPlayerView, RoomState } from '../../../../src/game-logic';

interface Env {
  BINGO_KV: KVNamespace;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const roomCode = (context.params.code as string).toUpperCase();
  const url = new URL(context.request.url);
  const playerId = url.searchParams.get('playerId');

  if (!playerId) {
    return Response.json({ error: 'playerId required.' }, { status: 400 });
  }

  const raw = await context.env.BINGO_KV.get(`room:${roomCode}`);
  if (!raw) {
    return Response.json({ error: 'Room not found.' }, { status: 404 });
  }

  const state: RoomState = JSON.parse(raw);
  const view = getPlayerView(state, playerId);
  return Response.json(view);
};
