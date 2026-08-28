// Страница владельца: CRUD типов событий + список предстоящих встреч.
// Доступ — по токену владельца (заголовок X-Owner-Token), токен хранится в localStorage.

import {
  listEventTypes,
  createEventType,
  updateEventType,
  deleteEventType,
  listBookings,
  getVersion,
  ApiError,
} from './api.js';
import { formatDateTime } from './format.js';
import { setFieldError, clearFieldErrors, setBusy } from './ui.js';

const TOKEN_KEY = 'ownerToken';

const state = {
  token: localStorage.getItem(TOKEN_KEY) || null,
  eventTypes: [],
  bookings: [],
  editingId: null,
};

const els = {
  tokenGate: document.querySelector('#token-gate'),
  tokenForm: document.querySelector('#token-form'),
  admin: document.querySelector('#admin'),
  logout: document.querySelector('#logout'),
  eventTypeForm: document.querySelector('#event-type-form'),
  eventTypeSubmit: document.querySelector('#event-type-submit'),
  eventTypeCancel: document.querySelector('#event-type-cancel'),
  eventTypesList: document.querySelector('#event-types-list'),
  bookingsTable: document.querySelector('#bookings-table'),
  bookingsBody: document.querySelector('#bookings-table tbody'),
  bookingsEmpty: document.querySelector('#bookings-empty'),
  appVersion: document.querySelector('#app-version'),
  error: document.querySelector('#error'),
};

function showError(message) {
  els.error.textContent = message;
  els.error.hidden = false;
}

function clearError() {
  els.error.hidden = true;
  els.error.textContent = '';
}

function showGate(message) {
  state.token = null;
  localStorage.removeItem(TOKEN_KEY);
  els.admin.hidden = true;
  els.tokenGate.hidden = false;
  if (message) showError(message);
}

function showAdmin() {
  els.tokenGate.hidden = true;
  els.admin.hidden = false;
}

// ── Загрузка данных ──────────────────────────────────────────

async function loadAll() {
  clearError();
  try {
    // Токен валиден, только если owner-запрос прошёл
    state.bookings = await listBookings(state.token);
    state.eventTypes = await listEventTypes();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      showGate('Неверный токен владельца.');
    } else {
      showError(err instanceof ApiError ? err.detail : 'Не удалось загрузить данные.');
    }
    return;
  }
  showAdmin();
  renderEventTypes();
  renderBookings();
}

// ── Типы событий ─────────────────────────────────────────────

function renderEventTypes() {
  els.eventTypesList.innerHTML = '';
  if (state.eventTypes.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-state';
    li.textContent = 'Типов событий пока нет.';
    els.eventTypesList.append(li);
    return;
  }
  for (const et of state.eventTypes) {
    const li = document.createElement('li');

    const text = document.createElement('span');
    text.textContent = et.description ? `${et.title} — ${et.description}` : et.title;

    const actions = document.createElement('div');
    actions.className = 'list-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'secondary';
    editBtn.textContent = 'Изменить';
    editBtn.addEventListener('click', () => startEdit(et));

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger';
    deleteBtn.textContent = 'Удалить';
    deleteBtn.addEventListener('click', () => removeEventType(et));

    actions.append(editBtn, deleteBtn);
    li.append(text, actions);
    els.eventTypesList.append(li);
  }
}

function startEdit(et) {
  state.editingId = et.id;
  els.eventTypeForm.elements.id.value = et.id;
  els.eventTypeForm.elements.title.value = et.title;
  els.eventTypeForm.elements.description.value = et.description ?? '';
  els.eventTypeSubmit.textContent = 'Сохранить';
  els.eventTypeCancel.hidden = false;
  els.eventTypeForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetForm() {
  state.editingId = null;
  els.eventTypeForm.reset();
  els.eventTypeForm.elements.id.value = '';
  els.eventTypeSubmit.textContent = 'Создать';
  els.eventTypeCancel.hidden = true;
}

function validateTitle() {
  const input = els.eventTypeForm.elements.title;
  if (String(input.value).trim()) return true;
  setFieldError(input, 'Укажите название типа события.');
  return false;
}

els.eventTypeCancel.addEventListener('click', resetForm);

els.eventTypeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  clearFieldErrors(els.eventTypeForm);
  if (!validateTitle()) return;

  const title = els.eventTypeForm.elements.title.value.trim();
  const description = els.eventTypeForm.elements.description.value.trim();
  const payload = description ? { title, description } : { title };
  const idleLabel = state.editingId ? 'Сохранить' : 'Создать';
  const busyLabel = state.editingId ? 'Сохраняем…' : 'Создаём…';

  setBusy(els.eventTypeSubmit, true, busyLabel, idleLabel);
  try {
    if (state.editingId) {
      await updateEventType(state.token, state.editingId, payload);
    } else {
      await createEventType(state.token, payload);
    }
    resetForm();
    await loadAll();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      showGate('Неверный токен владельца.');
    } else {
      showError(err instanceof ApiError ? err.detail : 'Не удалось сохранить тип события.');
    }
  } finally {
    setBusy(els.eventTypeSubmit, false, '', state.editingId ? 'Сохранить' : 'Создать');
  }
});

els.eventTypeForm.elements.title.addEventListener('input', () => {
  const input = els.eventTypeForm.elements.title;
  input.classList.remove('invalid');
  input.removeAttribute('aria-invalid');
  const error = input.parentElement.querySelector('.field-error');
  if (error) error.remove();
});

async function removeEventType(et) {
  clearError();
  if (!confirm(`Удалить тип «${et.title}»?`)) return;
  try {
    await deleteEventType(state.token, et.id);
    if (state.editingId === et.id) resetForm();
    await loadAll();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      showGate('Неверный токен владельца.');
    } else {
      showError(err instanceof ApiError ? err.detail : 'Не удалось удалить тип события.');
    }
  }
}

// ── Встречи ──────────────────────────────────────────────────

function renderBookings() {
  els.bookingsBody.innerHTML = '';
  els.bookingsEmpty.hidden = state.bookings.length > 0;
  els.bookingsTable.hidden = state.bookings.length === 0;

  const typeById = new Map(state.eventTypes.map((et) => [et.id, et.title]));

  const sorted = [...state.bookings].sort(
    (a, b) => new Date(a.start) - new Date(b.start),
  );

  // Подписи колонок нужны и таблице (thead), и мобильным «карточкам»
  // (CSS берёт их из data-label через ::before — см. styles.css).
  const labels = ['Когда', 'Тип', 'Гость', 'Email'];

  for (const b of sorted) {
    const tr = document.createElement('tr');
    const values = [
      formatDateTime(b.start),
      typeById.get(b.eventTypeId) ?? '—',
      b.attendeeName,
      b.attendeeEmail,
    ];
    for (const [i, value] of values.entries()) {
      const td = document.createElement('td');
      td.textContent = value;
      td.setAttribute('data-label', labels[i]);
      tr.append(td);
    }
    els.bookingsBody.append(tr);
  }
}

// ── Токен ────────────────────────────────────────────────────

els.tokenForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const token = els.tokenForm.elements.token.value.trim();
  if (!token) return;
  state.token = token;
  localStorage.setItem(TOKEN_KEY, token);
  els.tokenForm.reset();
  const submitBtn = els.tokenForm.querySelector('button[type="submit"]');
  setBusy(submitBtn, true, 'Входим…', 'Войти');
  loadAll().finally(() => setBusy(submitBtn, false));
});

els.logout.addEventListener('click', () => {
  showGate(null);
  clearError();
});

// ── Версия ───────────────────────────────────────────────────

async function loadVersion() {
  try {
    const info = await getVersion();
    if (els.appVersion) els.appVersion.textContent = `v${info.version}`;
  } catch {
    // Версия не критична — молча пропускаем при недоступном API.
  }
}

// ── Старт ────────────────────────────────────────────────────

if (state.token) {
  loadAll();
} else {
  showGate(null);
}
loadVersion();
