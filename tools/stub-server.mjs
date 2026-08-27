// Stateful dev-стаб API по контракту spec/openapi/openapi.yaml.
// Замена Prism-мока: хранит данные в памяти, генерирует слоты по правилам
// контракта (30 мин, 09:00–18:00 UTC, окно 14 дней), реальные 401/404/409/400.
//
// Запуск: node tools/stub-server.mjs [port]     (по умолчанию 4010)
// Токен владельца: env OWNER_TOKEN (по умолчанию "dev-token").

import http from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.argv[2] || 4010);
const OWNER_TOKEN = process.env.OWNER_TOKEN || 'dev-token';

// Версия стаба — совпадает с версией пакета backend (обновляется с релизами).
const APP_VERSION = '0.2.1';

const SLOT_MINUTES = 30;
const DAY_START_HOUR_UTC = 9;
const DAY_END_HOUR_UTC = 18;
const WINDOW_DAYS = 14;

// ── Хранилище (in-memory) ────────────────────────────────────

/** @type {Map<string, {id: string, title: string, description?: string}>} */
const eventTypes = new Map();

/** @type {Array<{id: string, eventTypeId: string, start: string, end: string, attendeeName: string, attendeeEmail: string}>} */
const bookings = [];

// Демо-данные, чтобы страница гостя сразу была живая
function seed() {
  if (eventTypes.size > 0) return;
  const demo = { id: randomUUID(), title: 'Знакомство', description: 'Короткий созвон на 30 минут' };
  eventTypes.set(demo.id, demo);
}

// ── Генерация слотов по правилам контракта ───────────────────

function slotsForWindow(fromIso) {
  const base = fromIso ? new Date(fromIso) : new Date();
  if (Number.isNaN(base.getTime())) return null;

  // начало UTC-дня, содержащего from
  const dayStart = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate());

  const takenStarts = new Set(bookings.map((b) => b.start));
  const now = Date.now();
  const slots = [];

  for (let d = 0; d < WINDOW_DAYS; d += 1) {
    const day = dayStart + d * 86_400_000;
    for (let minutes = DAY_START_HOUR_UTC * 60; minutes < DAY_END_HOUR_UTC * 60; minutes += SLOT_MINUTES) {
      const startMs = day + minutes * 60_000;
      const endMs = startMs + SLOT_MINUTES * 60_000;
      const start = new Date(startMs).toISOString();
      const end = new Date(endMs).toISOString();
      // прошедшие слоты недоступны для записи
      const available = !takenStarts.has(start) && startMs > now;
      slots.push({ start, end, available });
    }
  }
  return slots;
}

function findSlot(startIso) {
  // слот валиден, если он попадает в сетку 30-минутных слотов окна 09:00–18:00 UTC
  // и входит в 14-дневное окно от сегодня
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return null;
  if (start.getTime() % (SLOT_MINUTES * 60_000) !== 0) return null;

  const minutesUtc = start.getUTCHours() * 60 + start.getUTCMinutes();
  if (minutesUtc < DAY_START_HOUR_UTC * 60 || minutesUtc >= DAY_END_HOUR_UTC * 60) return null;

  const todayStart = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  );
  if (start.getTime() < todayStart || start.getTime() >= todayStart + WINDOW_DAYS * 86_400_000) return null;

  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + SLOT_MINUTES * 60_000).toISOString(),
  };
}

// ── Утилиты ответа ───────────────────────────────────────────

function sendJson(res, status, data, extraHeaders = {}) {
  const body = data === null ? '' : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Owner-Token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Private-Network': 'true',
    ...extraHeaders,
  });
  res.end(body);
}

function sendCorsPreflight(req, res) {
  const requestedHeaders = req.headers['access-control-request-headers'];
  const allowedHeaders = requestedHeaders
    ? `Content-Type, X-Owner-Token, ${requestedHeaders}`
    : 'Content-Type, X-Owner-Token';
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': allowedHeaders,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Private-Network': 'true',
    'Vary': 'Origin, Access-Control-Request-Headers',
  });
  res.end();
}

function sendProblem(res, status, title, detail) {
  sendJson(res, status, {
    type: 'about:blank',
    title,
    status,
    detail,
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

function checkOwner(req, res) {
  const token = req.headers['x-owner-token'];
  if (token !== OWNER_TOKEN) {
    sendProblem(res, 401, 'Unauthorized', 'Отсутствует или неверен заголовок X-Owner-Token.');
    return false;
  }
  return true;
}

// ── Роутинг ──────────────────────────────────────────────────

async function handle(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return sendCorsPreflight(req, res);
  }

  // /api/version
  if (path === '/api/version') {
    if (req.method === 'GET') {
      return sendJson(res, 200, { version: APP_VERSION });
    }
  }

  // /api/event-types
  if (path === '/api/event-types') {
    if (req.method === 'GET') {
      return sendJson(res, 200, [...eventTypes.values()]);
    }
    if (req.method === 'POST') {
      if (!checkOwner(req, res)) return;
      const body = await readBody(req);
      if (!isNonEmptyString(body.title)) {
        return sendProblem(res, 400, 'Bad Request', 'Поле title обязательно и не должно быть пустым.');
      }
      if (body.description !== undefined && typeof body.description !== 'string') {
        return sendProblem(res, 400, 'Bad Request', 'Поле description должно быть строкой.');
      }
      const et = { id: randomUUID(), title: body.title.trim() };
      if (body.description) et.description = body.description;
      eventTypes.set(et.id, et);
      return sendJson(res, 200, et);
    }
  }

  // /api/event-types/{id}[/slots]
  const etMatch = path.match(/^\/api\/event-types\/([^/]+)(\/slots)?$/);
  if (etMatch) {
    const [, id, sub] = etMatch;
    const et = eventTypes.get(id);
    if (!et) {
      return sendProblem(res, 404, 'Not Found', `Тип события ${id} не найден.`);
    }

    if (sub === '/slots' && req.method === 'GET') {
      const from = url.searchParams.get('from');
      const slots = slotsForWindow(from ?? undefined);
      if (slots === null) {
        return sendProblem(res, 400, 'Bad Request', 'Параметр from должен быть датой в формате ISO 8601.');
      }
      return sendJson(res, 200, slots);
    }

    if (!sub && req.method === 'GET') {
      return sendJson(res, 200, et);
    }

    if (!sub && req.method === 'PUT') {
      if (!checkOwner(req, res)) return;
      const body = await readBody(req);
      if (body.title !== undefined && !isNonEmptyString(body.title)) {
        return sendProblem(res, 400, 'Bad Request', 'Поле title не должно быть пустым.');
      }
      if (body.title !== undefined) et.title = body.title.trim();
      if (body.description !== undefined) et.description = body.description;
      return sendJson(res, 200, et);
    }

    if (!sub && req.method === 'DELETE') {
      if (!checkOwner(req, res)) return;
      eventTypes.delete(id);
      return sendJson(res, 204, null);
    }
  }

  // /api/bookings
  if (path === '/api/bookings') {
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (!isNonEmptyString(body.eventTypeId)) {
        return sendProblem(res, 400, 'Bad Request', 'Поле eventTypeId обязательно.');
      }
      if (!eventTypes.has(body.eventTypeId)) {
        return sendProblem(res, 404, 'Not Found', `Тип события ${body.eventTypeId} не найден.`);
      }
      if (!isNonEmptyString(body.start)) {
        return sendProblem(res, 400, 'Bad Request', 'Поле start обязательно (ISO 8601, UTC).');
      }
      if (!isNonEmptyString(body.attendeeName)) {
        return sendProblem(res, 400, 'Bad Request', 'Поле attendeeName обязательно.');
      }
      if (!isEmail(body.attendeeEmail)) {
        return sendProblem(res, 400, 'Bad Request', 'Поле attendeeEmail должно быть валидным email.');
      }
      const slot = findSlot(body.start);
      if (!slot) {
        return sendProblem(res, 400, 'Bad Request', 'Время start не попадает в сетку доступных слотов.');
      }
      if (bookings.some((b) => b.start === slot.start)) {
        return sendProblem(res, 409, 'Conflict', 'Это время уже занято.');
      }
      const booking = {
        id: randomUUID(),
        eventTypeId: body.eventTypeId,
        start: slot.start,
        end: slot.end,
        attendeeName: body.attendeeName.trim(),
        attendeeEmail: body.attendeeEmail.trim(),
      };
      bookings.push(booking);
      return sendJson(res, 200, booking);
    }

    if (req.method === 'GET') {
      if (!checkOwner(req, res)) return;
      const now = new Date().toISOString();
      const upcoming = bookings
        .filter((b) => b.end > now)
        .sort((a, b) => a.start.localeCompare(b.start));
      return sendJson(res, 200, upcoming);
    }
  }

  return sendProblem(res, 404, 'Not Found', `${req.method} ${path} не существует.`);
}

// ── Запуск ───────────────────────────────────────────────────

seed();

http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    if (err.message === 'invalid json') {
      return sendProblem(res, 400, 'Bad Request', 'Тело запроса должно быть валидным JSON.');
    }
    console.error(err);
    sendProblem(res, 500, 'Internal Server Error', 'Внутренняя ошибка стаба.');
  });
}).listen(PORT, () => {
  console.log(`Stub API на http://127.0.0.1:${PORT} (owner token: "${OWNER_TOKEN}")`);
});
