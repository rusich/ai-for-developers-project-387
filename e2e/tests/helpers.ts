// Общие утилиты e2e-тестов.
// Фронт (8080) и API (3000) — разные origins, поэтому в каждом тесте
// перед загрузкой страницы прописываем localStorage.apiBase
// (как это делает разработчик в консоли браузера). Заодно e2e проверяет CORS.

import { expect, type Page } from '@playwright/test';

export const API_BASE = 'http://127.0.0.1:3000';
export const OWNER_TOKEN = 'dev-token';

// Открывает страницу фронтенда с настроенным API-базой.
export async function open(page: Page, path: string): Promise<void> {
  await page.addInitScript((base) => {
    localStorage.setItem('apiBase', base);
  }, API_BASE);
  await page.goto(path);
}

// Выбирает тип события и возвращает локатор первого свободного слота на первом
// дне, где такие слоты есть. Не полагаемся на то, что у «сегодня» остались
// будущие слоты (после 18:00 UTC их нет) — иначе тест зависит от времени суток.
// Возвращает тип Locator.
export async function selectTypeAndFreeSlot(page: Page, eventTypeTitle: string) {
  await page.locator('#event-types button', { hasText: eventTypeTitle }).click();
  await expect(page.locator('#step-slot')).toBeVisible();

  // Ждём загрузки слотов и выбираем первый день, в котором есть свободные слоты.
  const freeDay = page.locator('#days .day:not(.full)').first();
  await expect(freeDay).toBeVisible();
  await freeDay.click();

  const slot = page.locator('#slots .slot:not([disabled])').first();
  await expect(slot).toBeVisible();
  return slot;
}

// Возвращает ISO-start первого свободного слота указанного типа события.
// Запрос выполняется из контекста страницы (через тот же fetch, что и фронт).
export async function firstFreeSlotStart(page: Page, eventTypeTitle: string): Promise<string> {
  return page.evaluate(
    async (args) => {
      const typesRes = await fetch(`${args.base}/api/event-types`);
      const types = (await typesRes.json()) as { id: string; title: string }[];
      const et = types.find((t) => t.title === args.title);
      if (!et) throw new Error(`event type not found: ${args.title}`);
      const slotsRes = await fetch(`${args.base}/api/event-types/${et.id}/slots`);
      const slots = (await slotsRes.json()) as { start: string; available: boolean }[];
      const free = slots.find((s) => s.available);
      if (!free) throw new Error('no free slots');
      return free.start;
    },
    { base: API_BASE, title: eventTypeTitle },
  );
}

// Бронирует слот напрямую через API — имитирует другого гостя,
// чтобы проверить конфликт 409 в UI.
export async function bookViaApi(page: Page, eventTypeTitle: string, start: string): Promise<void> {
  await page.evaluate(
    async (args) => {
      const typesRes = await fetch(`${args.base}/api/event-types`);
      const types = (await typesRes.json()) as { id: string; title: string }[];
      const et = types.find((t) => t.title === args.title);
      if (!et) throw new Error(`event type not found: ${args.title}`);
      const res = await fetch(`${args.base}/api/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventTypeId: et.id,
          start: args.start,
          attendeeName: 'Конкурент',
          attendeeEmail: 'rival@example.com',
        }),
      });
      if (!res.ok) throw new Error(`booking failed: ${res.status}`);
    },
    { base: API_BASE, title: eventTypeTitle, start },
  );
}
