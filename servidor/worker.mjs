import { validPlan } from './validation.mjs';

const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
const smallText = (value, max) => typeof value === 'string' && value.length <= max;
const validInvite = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
const snapshot = ({ inviteHash, ...row }) => row;

async function readJson(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw json({ error: 'Usa JSON.' }, 415);
  if (Number(request.headers.get('content-length') || 0) > 300000) throw json({ error: 'El plan es demasiado grande.' }, 413);
  const reader = request.body?.getReader();
  if (!reader) throw json({ error: 'Datos inválidos.' }, 400);
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 300000) { await reader.cancel(); throw json({ error: 'El plan es demasiado grande.' }, 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw json({ error: 'Datos inválidos.' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw json({ error: 'Datos inválidos.' }, 400);
  return body;
}

function withHeaders(response, origin) {
  const result = new Response(response.body, response);
  result.headers.set('Referrer-Policy', 'no-referrer');
  result.headers.set('X-Content-Type-Options', 'nosniff');
  result.headers.set('Vary', 'Origin');
  if (origin) {
    result.headers.set('Access-Control-Allow-Origin', origin);
    result.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    result.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  return result;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const origin = request.headers.get('origin');
    const allowed = origin === url.origin || origin === env.PUBLIC_ORIGIN;
    if (origin && !allowed) return json({ error: 'Origen no permitido.' }, 403);
    if (request.method === 'OPTIONS') return allowed ? withHeaders(new Response(null, { status: 204 }), origin) : json({ error: 'Origen no permitido.' }, 403);
    if (!['GET', 'POST', 'PUT'].includes(request.method)) return withHeaders(json({ error: 'Método no permitido.' }, 405), origin);
    if (request.method !== 'GET' && !allowed) return json({ error: 'Origen no permitido.' }, 403);
    try {
      let result;
      if (url.pathname === '/api/collaboration' && request.method === 'GET') {
        result = json({ available: !!env.GROUPS, signedIn: false, displayName: 'Amigo', access: 'invitation' });
      } else if (url.pathname === '/api/groups' && request.method === 'POST') {
        const body = await readJson(request);
        if (!validPlan(body.plan) || !smallText(body.title, 80) || !body.title.trim()) return withHeaders(json({ error: 'Revisa el nombre y el itinerario.' }, 400), origin);
        const limiter = env.CREATE_LIMIT.get(env.CREATE_LIMIT.idFromName('group-creation'));
        const ipHash = await hash(request.headers.get('CF-Connecting-IP') || 'local');
        const limit = await limiter.fetch('https://internal/check', { method: 'POST', body: JSON.stringify({ ipHash }) });
        if (!limit.ok) return withHeaders(limit, origin);
        const id = crypto.randomUUID(), invite = token();
        const group = env.GROUPS.get(env.GROUPS.idFromName(id));
        result = await group.fetch('https://internal/create', { method: 'POST', body: JSON.stringify({ id, inviteHash: await hash(invite), title: body.title.trim(), plan: body.plan, author: smallText(body.author, 60) && body.author.trim() || 'Amigo' }) });
        const created = await result.json();
        result = json({ ...created, invite }, 201);
      } else {
        const match = url.pathname.match(/^\/api\/groups\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(\/join)?$/);
        if (!match) return withHeaders(json({ error: 'Ruta no encontrada.' }, 404), origin);
        const joining = !!match[2];
        if (joining && request.method !== 'POST' || !joining && !['GET', 'PUT'].includes(request.method)) return withHeaders(json({ error: 'Método no permitido.' }, 405), origin);
        const body = request.method === 'GET' ? null : await readJson(request);
        const invite = joining ? body.invite : request.headers.get('Authorization')?.replace(/^Bearer /, '');
        if (!validInvite(invite)) return withHeaders(json({ error: 'Abre la invitación original para entrar y editar el grupo.' }, 403), origin);
        if (request.method === 'PUT' && (!validPlan(body.plan) || !Number.isSafeInteger(body.revision) || body.revision < 1)) return withHeaders(json({ error: 'Itinerario inválido.' }, 400), origin);
        const group = env.GROUPS.get(env.GROUPS.idFromName(match[1]));
        result = await group.fetch('https://internal/' + (request.method === 'PUT' ? 'save' : 'read'), { method: 'POST', body: JSON.stringify({ inviteHash: await hash(invite), plan: body?.plan, revision: body?.revision, author: smallText(body?.author, 60) && body.author.trim() || 'Amigo' }) });
      }
      return withHeaders(result, origin);
    } catch (error) {
      return withHeaders(error instanceof Response ? error : json({ error: 'No pudimos guardar ahora. Conservamos tu borrador; vuelve a intentar.' }, 503), origin);
    }
  }
};

// Each group is serialized by its own Durable Object. The transaction also protects
// the revision when an asynchronous request yields to another editor.
export class TripGroup {
  constructor(state) { this.storage = state.storage; }
  async fetch(request) {
    const op = new URL(request.url).pathname, input = await request.json();
    return this.storage.transaction(async tx => {
      let row = await tx.get('plan');
      if (op === '/create') {
        if (row) return json({ error: 'Este grupo ya existe.' }, 409);
        row = { id: input.id, inviteHash: input.inviteHash, title: input.title, plan: input.plan, revision: 1, updatedAt: new Date().toISOString(), updatedBy: input.author };
        await tx.put('plan', row);
        return json(snapshot(row), 201);
      }
      if (!row || input.inviteHash !== row.inviteHash) return json({ error: 'La invitación no corresponde a este grupo.' }, 403);
      if (op === '/read') return json(snapshot(row));
      if (op !== '/save') return json({ error: 'Ruta no encontrada.' }, 404);
      if (input.revision !== row.revision) return json({ error: 'Otro amigo guardó cambios antes. Revisa la nueva versión.', latest: snapshot(row) }, 409);
      row = { ...row, plan: input.plan, revision: row.revision + 1, updatedAt: new Date().toISOString(), updatedBy: input.author };
      await tx.put('plan', row);
      return json(snapshot(row));
    });
  }
}

export class CreationLimit {
  constructor(state) { this.storage = state.storage; }
  async fetch(request) {
    const { ipHash } = await request.json(), day = new Date().toISOString().slice(0, 10);
    return this.storage.transaction(async tx => {
      let usage = await tx.get('usage');
      if (usage?.day !== day) usage = { day, total: 0, ips: {} };
      if (usage.total >= 100 || (usage.ips[ipHash] || 0) >= 5) return json({ error: 'Por hoy se alcanzó el límite para crear grupos. Los grupos existentes siguen disponibles.' }, 429);
      usage.total++;
      usage.ips[ipHash] = (usage.ips[ipHash] || 0) + 1;
      await tx.put('usage', usage);
      return json({ ok: true });
    });
  }
}
