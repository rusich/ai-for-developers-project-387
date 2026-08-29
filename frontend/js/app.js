// Страница гостя: выбор типа события → слота → форма → бронирование.

import {
  listEventTypes,
  getSlots,
  createBooking,
  getVersion,
  ApiError,
} from './api.js';

// format.js и ui.js нужны только на шагах 2–3 (выбор слота и форма).
// Подгружаем их по требованию, чтобы на старте страницы не оценивать
// лишние модули на главном потоке (снижает worst-case Total Blocking Time).
let formatModule;
function loadFormat() {
  formatModule ??= import('./format.js');
  return formatModule;
}
let uiModule;
function loadUi() {
  uiModule ??= import('./ui.js');
  return uiModule;
}

const state = {
  eventTypes: [],
  eventType: null,   // выбранный тип события
  slots: [],         // слоты выбранного типа (14 дней)
  dayKey: null,      // выбранный локальный день (YYYY-MM-DD)
  slot: null,        // выбранный слот
};

let todayKey;        // локальный день «сегодня», вычисляется при первом рендере дней

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
  bookingSubmit: document.querySelector('#booking-submit'),
  backToSlots: document.querySelector('#back-to-slots'),
  confirmation: document.querySelector('#confirmation'),
  doneDetails: document.querySelector('#done-details'),
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
    els.eventTypes.innerHTML = '<p class="empty-state">Пока нет доступных типов встреч.</p>';
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
  els.slots.innerHTML = '<p class="empty-state">Загружаем слоты…</p>';
  els.days.innerHTML = '';
  els.slotsEmpty.hidden = true;
  showStep(els.stepSlot);

  try {
    state.slots = await getSlots(et.id);
  } catch (err) {
    showError(err instanceof ApiError ? err.detail : 'Не удалось загрузить слоты.');
    return;
  }
  await renderDays();
  await renderSlots();
}

function groupSlotsByDay(localDayKey) {
  const groups = new Map();
  for (const slot of state.slots) {
    const key = localDayKey(slot.start);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(slot);
  }
  return groups;
}

async function renderDays() {
  const { formatDay, localDayKey } = await loadFormat();
  todayKey ??= localDayKey(new Date().toISOString());
  const groups = groupSlotsByDay(localDayKey);
  els.days.innerHTML = '';
  const keys = [...groups.keys()];
  if (keys.length === 0) {
    els.slotsEmpty.hidden = false;
    els.slotsEmpty.textContent = 'Нет свободных слотов в этом окне.';
    return;
  }
  // По умолчанию выбираем первый день, где есть свободные слоты (а не просто первый день).
  if (!state.dayKey || !groups.has(state.dayKey)) {
    state.dayKey = keys.find((k) => groups.get(k).some((s) => s.available)) ?? keys[0];
  }
  for (const key of keys) {
    const daySlots = groups.get(key);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'day';
    if (key === todayKey) btn.classList.add('today');
    if (key === state.dayKey) btn.classList.add('active');
    btn.setAttribute('aria-pressed', String(key === state.dayKey));
    btn.textContent = formatDay(daySlots[0].start);
    if (!daySlots.some((s) => s.available)) btn.classList.add('full');
    btn.addEventListener('click', async () => {
      state.dayKey = key;
      await renderDays();
      await renderSlots();
    });
    els.days.append(btn);
  }
}

async function renderSlots() {
  const { localDayKey, formatSlotRange } = await loadFormat();
  const groups = groupSlotsByDay(localDayKey);
  const daySlots = groups.get(state.dayKey) ?? [];
  els.slots.innerHTML = '';
  const hasAvailable = daySlots.some((s) => s.available);
  els.slotsEmpty.hidden = hasAvailable;
  if (!hasAvailable) {
    els.slotsEmpty.textContent = daySlots.length > 0
      ? 'На этот день свободных слотов нет — выберите другой день.'
      : 'Нет свободных слотов в этом окне.';
    return;
  }
  for (const slot of daySlots) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'slot';
    btn.textContent = formatSlotRange(slot);
    btn.disabled = !slot.available;
    btn.setAttribute('aria-disabled', String(!slot.available));
    btn.addEventListener('click', () => selectSlot(slot));
    els.slots.append(btn);
  }
}

// ── Шаг 3: форма ─────────────────────────────────────────────

async function selectSlot(slot) {
  clearError();
  state.slot = slot;
  const { formatDateTime, formatSlotRange } = await loadFormat();
  els.chosenSlot.textContent = `${formatDateTime(slot.start)} — ${formatSlotRange(slot)}`;
  showStep(els.stepForm);
}

els.backToSlots.addEventListener('click', () => {
  state.slot = null;
  showStep(els.stepSlot);
});

function validateBookingForm(setFieldError) {
  const nameInput = els.bookingForm.elements.attendeeName;
  const emailInput = els.bookingForm.elements.attendeeEmail;
  const name = String(nameInput.value).trim();
  const email = String(emailInput.value).trim();
  let valid = true;

  if (!name) {
    setFieldError(nameInput, 'Укажите ваше имя.');
    valid = false;
  }
  if (!email) {
    setFieldError(emailInput, 'Укажите email для подтверждения.');
    valid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setFieldError(emailInput, 'Похоже, это не email.');
    valid = false;
  }
  return valid;
}

function renderDone(booking, payload, formatDateTime) {
  els.confirmation.textContent =
    `Вы записаны на «${state.eventType.title}»: ${formatDateTime(booking.start)}.`;
  els.doneDetails.innerHTML = '';
  const rows = [
    ['Встреча', state.eventType.title],
    ['Время', formatDateTime(booking.start)],
    ['Имя', payload.attendeeName],
    ['Email', payload.attendeeEmail],
  ];
  for (const [term, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    els.doneDetails.append(dt, dd);
  }
}

els.bookingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  const { setFieldError, clearFieldErrors, setBusy } = await loadUi();
  const { formatDateTime } = await loadFormat();
  clearFieldErrors(els.bookingForm);
  if (!validateBookingForm(setFieldError)) return;

  const formData = new FormData(els.bookingForm);
  const payload = {
    eventTypeId: state.eventType.id,
    start: state.slot.start,
    attendeeName: String(formData.get('attendeeName')).trim(),
    attendeeEmail: String(formData.get('attendeeEmail')).trim(),
  };

  setBusy(els.bookingSubmit, true, 'Бронируем…', 'Забронировать');
  for (const input of els.bookingForm.querySelectorAll('input')) {
    input.disabled = true;
  }
  try {
    const booking = await createBooking(payload);
    renderDone(booking, payload, formatDateTime);
    els.bookingForm.reset();
    showStep(els.stepDone);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      // Слот успели занять: обновляем слоты и возвращаем к выбору
      showError('Это время уже заняли. Выберите другой слот.');
      state.slot = null;
      state.slots = await getSlots(state.eventType.id);
      await renderDays();
      await renderSlots();
      showStep(els.stepSlot);
    } else {
      showError(err instanceof ApiError ? err.detail : 'Не удалось создать бронирование.');
    }
  } finally {
    setBusy(els.bookingSubmit, false);
    for (const input of els.bookingForm.querySelectorAll('input')) {
      input.disabled = false;
    }
  }
});

for (const input of els.bookingForm.querySelectorAll('input')) {
  input.addEventListener('input', () => {
    input.classList.remove('invalid');
    input.removeAttribute('aria-invalid');
    const error = input.parentElement.querySelector('.field-error');
    if (error) error.remove();
  });
}

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
