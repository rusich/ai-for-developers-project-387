// API-клиент по контракту spec/openapi/openapi.yaml
// Не содержит DOM-зависимостей — может выполняться и в браузере, и в Node (для smoke-тестов).

// Базовый URL API. Приоритет:
//   1) явный override (setApiBaseUrl, для тестов)
//   2) localStorage.apiBase (для разработки против отдельно запущенного бэкенда/мока)
//   3) пустая строка = тот же origin, откуда раздаётся статика (прод: axum отдаёт и API, и статику)
let apiBaseOverride = null;

export function setApiBaseUrl(url) {
  apiBaseOverride = url;
}

export function getApiBaseUrl() {
  if (apiBaseOverride !== null) return apiBaseOverride;
  if (typeof localStorage !== 'undefined') {
    const fromStorage = localStorage.getItem('apiBase');
    if (fromStorage) return fromStorage;
  }
  return '';
}

// Ошибка API в формате RFC7807 (Problem Details): { type, title, status, detail }
export class ApiError extends Error {
  constructor(problem) {
    super(problem.detail || problem.title || `HTTP ${problem.status}`);
    this.type = problem.type;
    this.title = problem.title;
    this.status = problem.status;
    this.detail = problem.detail;
  }
}

// Низкоуровневый запрос (экспортирован как escape hatch и для тестов)
export async function request(path, { method = 'GET', body, ownerToken, extraHeaders } = {}) {
  const headers = { ...extraHeaders };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (ownerToken) headers['X-Owner-Token'] = ownerToken;

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    // HTTP-статус ответа авторитетнее поля status в теле (RFC7807 требует их совпадения,
    // но моки могут подставлять случайные значения)
    const status = response.status;
    if (data && typeof data.type === 'string' && typeof data.title === 'string') {
      throw new ApiError({
        type: data.type,
        title: data.title,
        status,
        detail: typeof data.detail === 'string' ? data.detail : (data.title ?? `HTTP ${status}`),
      });
    }
    throw new ApiError({
      type: 'about:blank',
      title: response.statusText || 'Request failed',
      status,
      detail: data ? JSON.stringify(data) : `HTTP ${status}`,
    });
  }

  return data;
}

// ── Event types ──────────────────────────────────────────────

export const listEventTypes = () => request('/api/event-types');

export const getEventType = (id) =>
  request(`/api/event-types/${encodeURIComponent(id)}`);

export const createEventType = (ownerToken, payload) =>
  request('/api/event-types', { method: 'POST', body: payload, ownerToken });

export const updateEventType = (ownerToken, id, payload) =>
  request(`/api/event-types/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: payload,
    ownerToken,
  });

export const deleteEventType = (ownerToken, id) =>
  request(`/api/event-types/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    ownerToken,
  });

// ── Slots ────────────────────────────────────────────────────

// from — опциональная строка ISO 8601 date-time (UTC)
export const getSlots = (eventTypeId, from) => {
  const query = from ? `?from=${encodeURIComponent(from)}` : '';
  return request(`/api/event-types/${encodeURIComponent(eventTypeId)}/slots${query}`);
};

// ── Version ──────────────────────────────────────────────────

export const getVersion = () => request('/api/version');

// ── Bookings ─────────────────────────────────────────────────

export const createBooking = (payload) =>
  request('/api/bookings', { method: 'POST', body: payload });

export const listBookings = (ownerToken) =>
  request('/api/bookings', { ownerToken });
