// Страница гостя: выбор типа события → слота → форма → бронирование.

import {
  listEventTypes,
  getSlots,
  createBooking,
  getVersion,
  ApiError,
} from './api.js';
import {
  formatDay,
  formatSlotRange,
  formatDateTime,
  localDayKey,
} from './format.js';

const state = {
  eventTypes: [],
  eventType: null,   // выбранный тип события
  slots: [],         // слоты выбранного типа (14 дней)
  dayKey: null,      // выбранный локальный день (YYYY-MM-DD)
  slot: null,        // выбранный слот
};

const els = {
  stepType: document.querySelector('#step-type'),
  stepSlot: document.querySelector('#step-slot'),
  stepForm: document.querySelector('#step-form'),
  stepDone: document.querySelector('#step-done'),
  eventTypes: document.querySelector('#event-types'),
  chosenType: document.querySelector('#chosen-type'),
  days: document.querySelector('#days'),
  slots: document.querySelector('#slots'),
  slotsEmpty: document.querySelector('#slots-empty'),
  chosenSlot: document.querySelector('#chosen-slot'),
  bookingForm: document.querySelector('#booking-form'),
  backToSlots: document.querySelector('#back-to-slots'),
  confirmation: document.querySelector('#confirmation'),
  bookAnother: document.querySelector('#book-another'),
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

function showStep(step) {
  for (const el of [els.stepSlot, els.stepForm, els.stepDone]) {
    el.hidden = el !== step;
  }
  if (step) step.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Шаг 1: типы событий ──────────────────────────────────────

async function loadEventTypes() {
  els.eventTypes.innerHTML = '<p class="muted">Загрузка…</p>';
  try {
    state.eventTypes = await listEventTypes();
    renderEventTypes();
  } catch (err) {
    els.eventTypes.innerHTML = '';
    showError(err instanceof ApiError ? err.detail : 'Не удалось загрузить типы встреч.');
  }
}

function renderEventTypes() {
  els.eventTypes.innerHTML = '';
  if (state.eventTypes.length === 0) {
    els.eventTypes.innerHTML = '<p class="muted">Пока нет доступных типов встреч.</p>';
    return;
  }
  for (const et of state.eventTypes) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    const title = document.createElement('strong');
    title.textContent = et.title;
    card.append(title);
    if (et.description) {
      const desc = document.createElement('span');
      desc.className = 'muted';
      desc.textContent = et.description;
      card.append(desc);
    }
    card.addEventListener('click', () => selectEventType(et));
    els.eventTypes.append(card);
  }
}

// ── Шаг 2: слоты ─────────────────────────────────────────────

async function selectEventType(et) {
  clearError();
  state.eventType = et;
  state.slot = null;
  els.chosenType.textContent = `— ${et.title}`;
  els.slots.innerHTML = '';
  els.days.innerHTML = '';
  els.slotsEmpty.hidden = true;
  showStep(els.stepSlot);

  try {
    state.slots = await getSlots(et.id);
  } catch (err) {
    showError(err instanceof ApiError ? err.detail : 'Не удалось загрузить слоты.');
    return;
  }
  renderDays();
  renderSlots();
}

function groupSlotsByDay() {
  const groups = new Map();
  for (const slot of state.slots) {
    const key = localDayKey(slot.start);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(slot);
  }
  return groups;
}

function renderDays() {
  const groups = groupSlotsByDay();
  els.days.innerHTML = '';
  const keys = [...groups.keys()];
  if (keys.length === 0) {
    els.slotsEmpty.hidden = false;
    return;
  }
  if (!state.dayKey || !groups.has(state.dayKey)) {
    state.dayKey = keys[0];
  }
  for (const key of keys) {
    const daySlots = groups.get(key);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day';
    if (key === state.dayKey) btn.classList.add('active');
    btn.textContent = formatDay(daySlots[0].start);
    if (!daySlots.some((s) => s.available)) btn.classList.add('full');
    btn.addEventListener('click', () => {
      state.dayKey = key;
      renderDays();
      renderSlots();
    });
    els.days.append(btn);
  }
}

function renderSlots() {
  const groups = groupSlotsByDay();
  const daySlots = groups.get(state.dayKey) ?? [];
  els.slots.innerHTML = '';
  els.slotsEmpty.hidden = daySlots.length > 0;
  for (const slot of daySlots) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot';
    btn.textContent = formatSlotRange(slot);
    btn.disabled = !slot.available;
    btn.addEventListener('click', () => selectSlot(slot));
    els.slots.append(btn);
  }
}

// ── Шаг 3: форма ─────────────────────────────────────────────

function selectSlot(slot) {
  clearError();
  state.slot = slot;
  els.chosenSlot.textContent = `${formatDateTime(slot.start)} — ${formatSlotRange(slot)}`;
  showStep(els.stepForm);
}

els.backToSlots.addEventListener('click', () => {
  state.slot = null;
  showStep(els.stepSlot);
});

els.bookingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  if (!els.bookingForm.reportValidity()) return;

  const formData = new FormData(els.bookingForm);
  const payload = {
    eventTypeId: state.eventType.id,
    start: state.slot.start,
    attendeeName: String(formData.get('attendeeName')).trim(),
    attendeeEmail: String(formData.get('attendeeEmail')).trim(),
  };

  try {
    const booking = await createBooking(payload);
    els.confirmation.textContent =
      `Вы записаны на «${state.eventType.title}»: ${formatDateTime(booking.start)}.`;
    els.bookingForm.reset();
    showStep(els.stepDone);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      // Слот успели занять: обновляем слоты и возвращаем к выбору
      showError('Это время уже заняли. Выберите другой слот.');
      state.slot = null;
      state.slots = await getSlots(state.eventType.id);
      renderDays();
      renderSlots();
      showStep(els.stepSlot);
    } else {
      showError(err instanceof ApiError ? err.detail : 'Не удалось создать бронирование.');
    }
  }
});

// ── Шаг 4: ещё одна запись ───────────────────────────────────

els.bookAnother.addEventListener('click', () => {
  state.eventType = null;
  state.slot = null;
  state.dayKey = null;
  els.stepSlot.hidden = true;
  els.stepForm.hidden = true;
  els.stepDone.hidden = true;
  clearError();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ── Старт ────────────────────────────────────────────────────

loadEventTypes();

async function loadVersion() {
  try {
    const info = await getVersion();
    if (els.appVersion) els.appVersion.textContent = `v${info.version}`;
  } catch {
    // Версия не критична — молча пропускаем при недоступном API.
  }
}
loadVersion();
