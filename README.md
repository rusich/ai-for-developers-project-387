# Календарь звонков (продолжение)

### Hexlet tests and linter status:
[![hexlet-check](https://github.com/rusich/ai-for-developers-project-387/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/rusich/ai-for-developers-project-387/actions)

### Status:
[![CI](https://github.com/rusich/ai-for-developers-project-387/actions/workflows/ci.yml/badge.svg)](https://github.com/rusich/ai-for-developers-project-387/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/rusich/ai-for-developers-project-387?label=release)](https://github.com/rusich/ai-for-developers-project-387/releases)
[![Release Please](https://github.com/rusich/ai-for-developers-project-387/actions/workflows/release-please.yml/badge.svg)](https://github.com/rusich/ai-for-developers-project-387/actions/workflows/release-please.yml)

Интегрируйте работу агентов в GitHub проект

Учебный проект Хекслета: https://ru.hexlet.io/programs/ai-for-developers
Как это должно работать: https://files.hexlet.app/a/2ipc5m

## Публичное приложение

- **Гость (бронирование):** https://ai-for-developers-project-387-production-bb87.up.railway.app
- **Владелец (админка):** https://ai-for-developers-project-387-production-bb87.up.railway.app/admin.html — токен `dev-token`

Деплой: Railway, **ручной** (`railway up` из корня репо, GitHub не подключён), сборка по `Dockerfile` (один контейнер: axum раздаёт и API, и статику). Запуск по порту из `PORT`. Хранилище пока in-memory — данные сбрасываются при каждом деплое.

## Стек

- Rust + axum (бэкенд, in-memory хранилище)
- Vanilla HTML/JS (фронтенд, без сборщиков)
- TypeSpec → OpenAPI 3.0 (контракт)

## Установка

Требования: Rust stable, Node ≥ 20 + npm, `just`, python3.

```bash
git clone https://github.com/rusich/ai-for-developers-project-387.git
cd ai-for-developers-project-387
just install        # npm install в spec/, tools/ и e2e/
just install-e2e    # браузер Chromium для Playwright (нужен один раз)
```

## Использование

```bash
just dev            # бэкенд (3000) + статика фронта (8080), Ctrl+C гасит оба
just test           # cargo test бэкенда (15 тестов)
just test-smoke     # smoke-тест API-клиента (24 проверки)
just e2e            # интеграционные e2e-тесты (4 теста в реальном браузере)
just docker-build   # сборка Docker-образа (context = корень репо)
just docker-run     # запуск контейнера (порт 3000, токен: dev-token)
```

Полный список — `just --list`.

## Docker

```bash
just docker-build   # docker build -t call-booking .
just docker-run     # docker run --rm -p 3000:3000 -e OWNER_TOKEN=dev-token call-booking
```

---

<details>
<summary>Автоматические тесты Хекслета</summary>

Тесты запускаются на каждый коммит. За запуск отвечает файл `.github/workflows/hexlet-check.yml` — не удаляйте и не переименовывайте ни его, ни репозиторий.

</details>

## О Хекслете

[Хекслет](https://ru.hexlet.io/) — школа программирования: авторские программы обучения с практикой, поддержкой наставников и реальными проектами, которые остаются в резюме. Этот репозиторий — один из таких проектов.
