// Тёмная тема: системная настройка (prefers-color-scheme), ручной переключатель
// на обеих страницах и сохранение выбора (localStorage). Не зависит от бэкенда.

import { test, expect, type Page } from '@playwright/test';

// Цвет фона <body> читаем через expect.poll: при переключении темы цвета
// плавно анимируются (~300мс, см. js/theme.js), поэтому значение нужно дождаться.
const expectBgColor = (page: Page, color: string) =>
  expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(color);

const DARK_BG = 'rgb(15, 23, 42)'; // --bg: #0f172a
const LIGHT_BG = 'rgb(248, 250, 252)'; // --bg: #f8fafc

test('гость: тема следует за системной, переключатель циклится и выбор сохраняется', async ({ page }) => {
  // Системная тёмная тема → по умолчанию приложение тёмное, режим «авто».
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');

  const toggle = page.locator('[data-theme-toggle]');
  await expect(toggle).toHaveText('Тема: авто');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expectBgColor(page, DARK_BG);

  // Кнопка → светлая тема, выбор сохраняется между перезагрузками.
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(toggle).toHaveText('Светлая тема');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expectBgColor(page, LIGHT_BG);

  await page.reload();
  await expect(toggle).toHaveText('Светлая тема');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  // Кнопка → тёмная тема, тоже сохраняется.
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(toggle).toHaveText('Тёмная тема');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expectBgColor(page, DARK_BG);

  await page.reload();
  await expect(toggle).toHaveText('Тёмная тема');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // Кнопка → снова «авто»: атрибут снимается, снова действует системная настройка.
  await toggle.click();
  await expect(toggle).toHaveText('Тема: авто');
  await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  // В режиме «авто» смена системной настройки меняет тему без клика.
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expectBgColor(page, LIGHT_BG);
});

test('владелец: переключатель темы работает и на странице админки', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/admin.html');

  const toggle = page.locator('[data-theme-toggle]');
  await expect(toggle).toHaveText('Тема: авто');
  await expectBgColor(page, LIGHT_BG);

  // Цикл режимов: авто → светлая → тёмная.
  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await toggle.click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expectBgColor(page, DARK_BG);
});
