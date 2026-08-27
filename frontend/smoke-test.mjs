// Smoke-тест API-клиента против stateful-стаба (tools/stub-server.mjs)
// или реального бэкенда. Проверяет реальное поведение по контракту,
// включая сохранение состояния между запросами.
//
// Запуск: node frontend/smoke-test.mjs [baseUrl] [ownerToken]
//         (по умолчанию http://127.0.0.1:4010 и dev-token)

import {
  setApiBaseUrl,
  listEventTypes,
  getEventType,
  createEventType,
  updateEventType,
  deleteEventType,
  getSlots,
  createBooking,
  listBookings,
  getVersion,
  ApiError,
} from './js/api.js';

const baseUrl = process.argv[2] || 'http://127.0.0.1:4010';
const TOKEN = process.argv[3] || 'dev-token';
setApiBaseUrl(baseUrl);

let passed = 0;
let failed = 0;

function check(name, condition, extra = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${name} ${extra}`);
  }
}

async function expectApiError(name, promise, status) {
  try {
    await promise;
    check(name, false, `(ожидался ${status}, запрос прошёл)`);
  } catch (err) {
    check(
      name,
      err instanceof ApiError && err.status === status
        && typeof err.type === 'string' && typeof err.title === 'string'
        && typeof err.detail === 'string',
      `(получено: ${err.status ?? err.message})`,
    );
  }
}

console.log(`Smoke-тест против ${baseUrl}\n`);

// ── Владелец: создание типа события сохраняется ────────────
const before = await listEventTypes();
check('GET /api/event-types → массив', Array.isArray(before));

// ── Версия приложения ────────────────────────────────────────
const versionInfo = await getVersion();
check(
  'GET /api/version → версия непустая строка',
  typeof versionInfo.version === 'string' && versionInfo.version.length > 0,
);

const created = await createEventType(TOKEN, {
  title: 'Консультация',
  description: 'Разбор вопроса',
});
check('POST /api/event-types → возвращает созданный тип', created.title === 'Консультация');

const after = await listEventTypes();
check(
  'созданный тип появился в списке (stateful)',
  after.length === before.length + 1 && after.some((t) => t.id === created.id),
);

const fetched = await getEventType(created.id);
check('GET /api/event-types/{id} → тот же тип', fetched.id === created.id && fetched.title === 'Консультация');

const updated = await updateEventType(TOKEN, created.id, { title: 'Стратсессия' });
check('PUT /api/event-types/{id} → обновляет title', updated.title === 'Стратсессия');

// ── Гость: слоты по правилам контракта ─────────────────────
const slots = await getSlots(created.id);
check('GET /slots → массив из 14 дней × 18 слотов = 252', slots.length === 252, `(получено ${slots.length})`);
check(
  'слоты выровнены по 30 минут, в окне 09:00–18:00 UTC',
  slots.every((s) => {
    const start = new Date(s.start);
    const mins = start.getUTCHours() * 60 + start.getUTCMinutes();
    return start.getTime() % (30 * 60_000) === 0 && mins >= 540 && mins < 1080;
  }),
);
check(
  'слоты идут по всем 7 дням недели в окне 14 дней',
  new Set(slots.map((s) => new Date(s.start).getUTCDay())).size === 7,
);

const slotsFrom = await getSlots(created.id, new Date(Date.now() + 7 * 86_400_000).toISOString());
check('slots с ?from=+7д → окно сдвигается', slotsFrom.length === 252
  && new Date(slotsFrom[0].start) > new Date(slots[0].start));

// ── Гость: бронирование ────────────────────────────────────
const freeSlot = slots.find((s) => s.available);
check('есть хотя бы один свободный слот', Boolean(freeSlot));

const booking = await createBooking({
  eventTypeId: created.id,
  start: freeSlot.start,
  attendeeName: 'Иван Иванов',
  attendeeEmail: 'ivan@example.com',
});
check(
  'POST /api/bookings → Booking с данными гостя',
  booking.attendeeName === 'Иван Иванов'
    && booking.start === freeSlot.start
    && booking.eventTypeId === created.id,
);

const slotsAfter = await getSlots(created.id);
const bookedSlot = slotsAfter.find((s) => s.start === freeSlot.start);
check('забронированный слот стал недоступен', bookedSlot && bookedSlot.available === false);

await expectApiError(
  'повторное бронирование того же времени → 409',
  createBooking({
    eventTypeId: created.id,
    start: freeSlot.start,
    attendeeName: 'Другой Гость',
    attendeeEmail: 'other@example.com',
  }),
  409,
);

// ── Владелец: список встреч ────────────────────────────────
const bookings = await listBookings(TOKEN);
check(
  'GET /api/bookings → содержит созданное бронирование',
  Array.isArray(bookings) && bookings.some((b) => b.id === booking.id),
);

// ── Ошибки по контракту ────────────────────────────────────
await expectApiError('POST /api/event-types без токена → 401', createEventType('', { title: 'x' }), 401);
await expectApiError('POST /api/event-types с неверным токеном → 401', createEventType('wrong', { title: 'x' }), 401);
await expectApiError('GET /api/bookings без токена → 401', listBookings(''), 401);
await expectApiError('POST /api/bookings с пустым телом → 400', createBooking({}), 400);
await expectApiError(
  'POST /api/bookings с невалидным email → 400',
  createBooking({ eventTypeId: created.id, start: freeSlot.start, attendeeName: 'Иван', attendeeEmail: 'не-email' }),
  400,
);
await expectApiError('GET /api/event-types/{несуществующий} → 404', getEventType('no-such-id'), 404);
await expectApiError('GET /slots несуществующего типа → 404', getSlots('no-such-id'), 404);

// ── Владелец: удаление ─────────────────────────────────────
const del = await deleteEventType(TOKEN, created.id);
check('DELETE /api/event-types/{id} → 204 (null)', del === null);
const finalList = await listEventTypes();
check('удалённый тип исчез из списка', !finalList.some((t) => t.id === created.id));

console.log(`\nИтог: ${passed} ok, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
