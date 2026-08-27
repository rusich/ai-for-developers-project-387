// Главный пользовательский сценарий бронирования (см. e2e/scenarios.md).
// Бэкенд in-memory и переживает шаги между тестами в рамках прогона,
// поэтому тесты идут в serial-режиме: каждый следующий опирается на данные предыдущего.

import { test, expect } from '@playwright/test';
import { open, selectTypeAndFreeSlot, firstFreeSlotStart, bookViaApi } from './helpers';

test.describe.configure({ mode: 'serial' });

// Уникальное название типа события на каждый прогон (бэкенд не сбрасывается между запусками локально).
const EVENT_TYPE_TITLE = `Консультация ${Date.now()}`;
const GUEST_NAME = 'Иван Петров';
const GUEST_EMAIL = 'ivan@example.com';

test('админ: неверный токен → ошибка, верный токен → вход и создание типа события', async ({ page }) => {
  await open(page, '/admin.html');

  await page.locator('#token-form input[name="token"]').fill('wrong-token');
  await page.locator('#token-form button[type="submit"]').click();
  await expect(page.locator('#error')).toContainText('Неверный токен владельца');

  await page.locator('#token-form input[name="token"]').fill('dev-token');
  await page.locator('#token-form button[type="submit"]').click();
  await expect(page.locator('#admin')).toBeVisible();

  await page.locator('#event-type-form input[name="title"]').fill(EVENT_TYPE_TITLE);
  await page.locator('#event-type-form button[type="submit"]').click();
  await expect(page.locator('#event-types-list')).toContainText(EVENT_TYPE_TITLE);
});

test('гость: видит тип события → выбирает слот → заполняет форму → подтверждение', async ({ page }) => {
  await open(page, '/');

  await expect(page.locator('#event-types')).toContainText(EVENT_TYPE_TITLE);
  const slot = await selectTypeAndFreeSlot(page, EVENT_TYPE_TITLE);
  await slot.click();
  await expect(page.locator('#step-form')).toBeVisible();

  await page.locator('#booking-form input[name="attendeeName"]').fill(GUEST_NAME);
  await page.locator('#booking-form input[name="attendeeEmail"]').fill(GUEST_EMAIL);
  await page.locator('#booking-form button[type="submit"]').click();

  await expect(page.locator('#step-done')).toBeVisible();
  await expect(page.locator('#confirmation')).toContainText('Вы записаны');
});

test('гость: бронирование уже занятого времени → ошибка 409 в UI', async ({ page }) => {
  await open(page, '/');

  // Выбираем тип и ждём, пока слоты отрисуются и первый свободный станет видимым.
  // Это важно сделать ДО бронирования «конкурентом»: иначе страница может
  // отрисовать слот уже занятым (disabled) и в списке не останется свободных.
  const slot = await selectTypeAndFreeSlot(page, EVENT_TYPE_TITLE);

  // Другой гость бронирует тот же первый свободный слот через API,
  // пока текущий гость уже видит его доступным на экране.
  const start = await firstFreeSlotStart(page, EVENT_TYPE_TITLE);
  await bookViaApi(page, EVENT_TYPE_TITLE, start);

  // UI не перерисовался, поэтому слот всё ещё активен — кликаем его и получаем 409.
  await slot.click();
  await page.locator('#booking-form input[name="attendeeName"]').fill('Мария Иванова');
  await page.locator('#booking-form input[name="attendeeEmail"]').fill('maria@example.com');
  await page.locator('#booking-form button[type="submit"]').click();

  await expect(page.locator('#error')).toContainText('Это время уже заняли');
});

test('админ: бронь гостя видна в списке предстоящих встреч', async ({ page }) => {
  await open(page, '/admin.html');

  await page.locator('#token-form input[name="token"]').fill('dev-token');
  await page.locator('#token-form button[type="submit"]').click();
  await expect(page.locator('#admin')).toBeVisible();

  const row = page.locator('#bookings-table tbody tr', { hasText: GUEST_EMAIL });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(GUEST_NAME);
  await expect(row).toContainText(EVENT_TYPE_TITLE);
});
