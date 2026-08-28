// Тёмная тема: следует за системной (prefers-color-scheme) + ручной переключатель.
// Явный выбор сохраняется в localStorage (ключ "theme") и применяется к <html>
// через атрибут data-theme; при режиме "system" атрибут снимается и работает
// системная настройка (медиа-запрос в styles.css). Начальное состояние до
// загрузки CSS применяет inline-скрипт в <head> обеих страниц — без «мигания».

const THEME_KEY = 'theme';

// Порядок цикла переключателя: авто → светлая → тёмная → авто.
const CYCLE = ['system', 'light', 'dark'];

// Подписи кнопки показывают текущий режим.
const LABELS = {
  system: 'Тема: авто',
  light: 'Светлая тема',
  dark: 'Тёмная тема',
};

let transitionTimer = null;

// Текущий режим темы: 'system' | 'light' | 'dark'.
export function currentTheme() {
  return localStorage.getItem(THEME_KEY) || 'system';
}

// Эффективная тёмная тема сейчас (учитывает и системную настройку).
export function isDark() {
  const theme = currentTheme();
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Применяет режим темы: ставит/снимает data-theme на <html> и сохраняет выбор.
export function setTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    delete root.dataset.theme;
    localStorage.removeItem(THEME_KEY);
  } else {
    root.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }
  syncToggle();
}

function syncToggle() {
  const btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;
  btn.textContent = LABELS[currentTheme()];
  btn.setAttribute('aria-pressed', String(isDark()));
}

// Плавный переход между темами: на время смены вешаем класс на <html>
// (см. html.theme-transition в styles.css), затем снимаем его.
function animateThemeChange() {
  const root = document.documentElement;
  root.classList.add('theme-transition');
  window.clearTimeout(transitionTimer);
  transitionTimer = window.setTimeout(() => {
    root.classList.remove('theme-transition');
  }, 300);
}

export function initThemeToggle() {
  const btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next = CYCLE[(CYCLE.indexOf(currentTheme()) + 1) % CYCLE.length];
    animateThemeChange();
    setTheme(next);
  });
  // При режиме «авто» переключение системы обновляет состояние кнопки.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (currentTheme() === 'system') syncToggle();
  });
  syncToggle();
}

initThemeToggle();
