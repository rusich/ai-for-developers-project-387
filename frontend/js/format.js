// Форматирование дат: сервер отдаёт UTC (ISO 8601), UI показывает локальное время.

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const fullFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

// "12:00"
export function formatTime(isoUtc) {
  return timeFormatter.format(new Date(isoUtc));
}

// "ср, 27 авг."
export function formatDay(isoUtc) {
  return dayFormatter.format(new Date(isoUtc));
}

// "27 августа, 12:00"
export function formatDateTime(isoUtc) {
  return fullFormatter.format(new Date(isoUtc));
}

// "12:00–12:30"
export function formatSlotRange(slot) {
  return `${formatTime(slot.start)}–${formatTime(slot.end)}`;
}

// Ключ для группировки слотов по локальному дню (YYYY-MM-DD в локальной зоне)
export function localDayKey(isoUtc) {
  const d = new Date(isoUtc);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
