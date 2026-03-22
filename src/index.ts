import { generateRoomCode, createRoom, handleAction, getPlayerView, RoomState } from './game-logic';

export interface Env {
  BINGO_KV: KVNamespace;
}

const KV_TTL = 3600; // 1 hour

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for all API responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // POST /api/create
    if (path === '/api/create' && request.method === 'POST') {
      try {
        const body = await request.json() as { name: string; playerId: string };
        const { name, playerId } = body;

        if (!name || !playerId) {
          return Response.json({ error: 'Name und playerId erforderlich.' }, { status: 400, headers: corsHeaders });
        }

        const roomCode = generateRoomCode();
        const state = createRoom(roomCode, playerId, name);
        await env.BINGO_KV.put(`room:${roomCode}`, JSON.stringify(state), { expirationTtl: KV_TTL });

        return Response.json({ roomCode }, { headers: corsHeaders });
      } catch {
        return Response.json({ error: 'Ungültige Anfrage.' }, { status: 400, headers: corsHeaders });
      }
    }

    // GET /api/room/:code/state?playerId=X
    const stateMatch = path.match(/^\/api\/room\/([A-Z0-9]+)\/state$/);
    if (stateMatch && request.method === 'GET') {
      const roomCode = stateMatch[1];
      const playerId = url.searchParams.get('playerId');

      if (!playerId) {
        return Response.json({ error: 'playerId erforderlich.' }, { status: 400, headers: corsHeaders });
      }

      const raw = await env.BINGO_KV.get(`room:${roomCode}`);
      if (!raw) {
        return Response.json({ error: 'Raum nicht gefunden.' }, { status: 404, headers: corsHeaders });
      }

      const state: RoomState = JSON.parse(raw);
      const view = getPlayerView(state, playerId);
      return Response.json(view, { headers: corsHeaders });
    }

    // POST /api/room/:code/action
    const actionMatch = path.match(/^\/api\/room\/([A-Z0-9]+)\/action$/);
    if (actionMatch && request.method === 'POST') {
      const roomCode = actionMatch[1];

      try {
        const action = await request.json() as { type: string; playerId: string; [key: string]: unknown };

        if (!action.type || !action.playerId) {
          return Response.json({ error: 'type und playerId erforderlich.' }, { status: 400, headers: corsHeaders });
        }

        const raw = await env.BINGO_KV.get(`room:${roomCode}`);
        if (!raw) {
          return Response.json({ error: 'Raum nicht gefunden.' }, { status: 404, headers: corsHeaders });
        }

        const state: RoomState = JSON.parse(raw);
        const result = handleAction(state, action);

        // Save updated state back to KV
        await env.BINGO_KV.put(`room:${roomCode}`, JSON.stringify(result.state), { expirationTtl: KV_TTL });

        // Return action response + player view for immediate feedback
        const view = getPlayerView(result.state, action.playerId);
        return Response.json({ ...result.response, state: view }, { headers: corsHeaders });
      } catch {
        return Response.json({ error: 'Ungültige Anfrage.' }, { status: 400, headers: corsHeaders });
      }
    }

    // Static assets are served automatically by wrangler [assets]
    return new Response('Not Found', { status: 404 });
  },
};
