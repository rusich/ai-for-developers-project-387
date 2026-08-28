# AGENTS.md — Call Booking (упрощённый Cal.com)

## Контекст проекта

Учебный проект курса «AI для программистов» (Hexlet). Цель — пройти полный цикл разработки небольшого веб-приложения с ИИ как рабочим инструментом. **Вся разработка ведётся через ИИ-агентов**: пользователь формулирует задачи, агент реализует, пользователь проверяет. В идеале пользователь не пишет код вручную.

Подход — **Design First**: сначала фиксируется API-контракт (TypeSpec → OpenAPI), затем фронтенд и бэкенд реализуются **независимо** по контракту. Контракт (`spec/main.tsp` + `spec/openapi/openapi.yaml`) — **единый источник правды** для обеих частей. При изменениях: обновить контракт → перекомпилировать → синхронно внести правки в обе части. Не анализировать чужую реализацию, опираться только на контракт (экономия токенов).

## Что за приложение

Сервис бронирования времени по мотивам Cal.com. Две роли, **без регистрации и авторизации**:

- **Владелец** (один предзаданный профиль, по умолчанию в админской части): создаёт типы событий, смотрит список предстоящих встреч (все типы в одном списке).
- **Гость**: смотрит список типов событий → выбирает тип → видит свободные слоты → бронирует.

## Зафиксированные решения (приняты с пользователем)

| Вопрос | Решение |
|---|---|
| Стек бэкенда | **Rust + axum** + serde + validator (in-memory, без БД) |
| Стек фронтенда | **Vanilla HTML/JS + fetch** (без сборщиков, пользователь слаб во фронте) |
| Контракт | **TypeSpec** → OpenAPI 3.0 (НЕ utoipa-аннотации в коде) |
| Слоты | Фиксированные **30 минут**, окно **09:00–18:00 UTC**, **все 7 дней** недели, на **14 дней** вперёд от `from` (по умолчанию сегодня) |
| Часовой пояс | Сервер хранит/отдаёт **UTC**; UI конвертирует в локальный (`Intl.DateTimeFormat`) |
| Идентификация владельца | Заголовок **`X-Owner-Token`** = значению из env `OWNER_TOKEN`; отсутствует/неверен → 401 |
| `durationMinutes` | **Убран** из EventType (слоты всегда 30 мин) — осознанное упрощение, хотя в задании поле упоминалось |
| Отмена бронирования | **Нет** (бронирование финально) |
| Правило занятости | Unique по `start` в `bookings` → повторное бронирование того же времени → **409 Conflict** (даже для разных типов событий) |
| Ошибки | Единый формат **RFC7807**: `{ type, title, status, detail }` |
| Хранилище | **In-memory** (данные сбрасываются при перезапуске/деплое) |
| Переменные окружения | `PORT` (default 3000), `OWNER_TOKEN` (default dev-token), `STATIC_DIR` (default frontend) |
| Порт бэкенда | **3000** (axum default); dev-стаб на Node — порт 4010 (fallback) |
| Деплой | Один Docker-контейнер: **axum раздаёт и API, и статику** (без отдельного nginx); прод: Railway, деплой **ручной** (`railway up` из корня репо, сборка по `Dockerfile`, запуск по `PORT`, `OWNER_TOKEN=dev-token`); публичная ссылка в README |
| Тёмная тема | `prefers-color-scheme` + ручной переключатель на обеих страницах; выбор в localStorage (ключ `theme`, режимы авто/светлая/тёмная), токены в CSS-переменных, атрибут `data-theme` на `<html>` |

## Структура репозитория

```
spec/                    # TypeSpec-контракт (ИСТОЧНИК ПРАВДЫ)
  main.tsp               # спецификация API
  tspconfig.yaml         # конфиг компилятора
  package.json           # зависимости typespec
  openapi/openapi.yaml   # сгенерированный OpenAPI (артефакт, коммитится)
  tsp-output/            # промежуточный вывод компилятора (в .gitignore)
frontend/                # vanilla HTML/JS (без сборщиков)
  index.html             # страница гостя
  admin.html             # страница владельца
  css/styles.css
  js/api.js              # API-клиент по контракту (без DOM, работает и в Node)
  js/format.js           # форматирование дат: UTC → локальное время (Intl)
  js/theme.js            # тёмная тема: переключатель + сохранение в localStorage
  js/ui.js               # общие UI-хелперы (inline-ошибки полей, состояния кнопок)
  js/app.js              # логика страницы гостя
  js/admin.js            # логика страницы владельца
  smoke-test.mjs         # smoke-тест API-клиента (node frontend/smoke-test.mjs [baseUrl] [token])
backend/                 # Rust + axum (in-memory), раздаёт API + статику (build_app)
  Cargo.toml
  src/{main,lib,models,state,slots,auth,error,cors,handlers}.rs
  # build_app(state, STATIC_DIR) — API + статика фронтенда (прод/Docker);
  # build_router(state) — только API, без статики (используется в тестах)
  tests/api.rs           # 11 интеграционных тестов + 4 юнит-теста слотов
tools/                   # dev-инструменты, node_modules в .gitignore
  stub-server.mjs        # stateful dev-стаб API на Node (fallback, порт 4010)
  (prism-cli)            # stateless-мок, только для проверки схем OpenAPI
e2e/                     # интеграционные e2e-тесты (Playwright, реальный браузер)
  playwright.config.ts   # webServer: бэкенд 3000 + статика 8080, chromium, UTC
  tests/booking-flow.spec.ts  # основной сценарий бронирования (4 теста, serial)
  scenarios.md           # описание пользовательских сценариев
.github/workflows/       # ci.yml (тесты), release-please.yml (релизы), hexlet-check.yml (не трогать)
release-please-config.json    # конфиг release-please (пакет на корне ".", release-type: rust)
.release-please-manifest.json # версия релизного компонента call-booking-backend (0.4.0)
CHANGELOG.md                  # changelog релизов (ведёт release-please, в корне репо)
ROADMAP.md                 # план развития UI/UX (задачи → GitHub issues)
Dockerfile                 # multi-stage: Rust-бинарь + статика фронтенда
docker-compose.yml         # локальный запуск из Docker-образа
.dockerignore              # контекст сборки — корень репозитория
```

## Команды

Основной способ — через `just` (justfile в корне, `just --list` покажет все команды):

```bash
just dev            # Rust-бэкенд (3000) + статика фронта (8080) одной командой, Ctrl+C гасит оба
just backend        # только Rust-бэкенд (cargo run, порт 3000)
just test           # cargo test бэкенда (15 тестов)
just stub           # только стаб API на Node (порт 4010, fallback, токен: dev-token)
just mock           # Prism-мок (stateless, только для проверки схем OpenAPI)
just serve          # только статика фронтенда
just test-smoke     # smoke-тест API-клиента против Rust-бэкенда (24 проверки)
just e2e            # Playwright e2e: собирает бэкенд, поднимает 3000+8080, гоняет браузерные сценарии
just install-e2e    # установка зависимостей e2e/ + браузер Chromium (нужен один раз)
just compile-spec   # перекомпиляция TypeSpec → spec/openapi/openapi.yaml
just install        # npm install в spec/, tools/ и e2e/
just docker-build   # сборка Docker-образа (context = корень репо)
just docker-run     # запуск контейнера (порт 3000, токен: dev-token)
```

Без `just` — вручную:

```bash
cd spec && npm run compile                          # перекомпиляция контракта
cd backend && cargo run                             # Rust-бэкенд (порт 3000, OWNER_TOKEN=... для смены токена)
node tools/stub-server.mjs 4010                     # стаб API на Node (fallback, OWNER_TOKEN=...)
cd frontend && python3 -m http.server 8080          # статика фронта
node frontend/smoke-test.mjs [baseUrl] [token]      # smoke-тест (по умолчанию :3000, dev-token)
cd backend && cargo test                            # тесты бэкенда
cd e2e && npx playwright test                       # e2e-тесты (бэкенд предварительно собран)
cd e2e && npx playwright install chromium           # браузер для e2e (нужен один раз)
```

## Новая машина (продолжение разработки в новой сессии)

Вся разработка ведётся через ИИ-агентов в новых сессиях; сессия не сохраняется.
Контекст для продолжения: `AGENTS.md` (этот файл) + история коммитов. Код, решения
и команды зафиксированы здесь и в git — отдельный экспорт сессии не нужен.

**Требования к окружению:** Rust stable, Node ≥ 20 + npm, `just`, python3.

**Установка с нуля:**

```bash
git clone git@github.com:rusich/ai-for-developers-project-387.git
cd ai-for-developers-project-387
just install        # npm install в spec/, tools/ и e2e/
just install-e2e    # браузер Chromium для Playwright (нужен один раз)
just test           # cargo test бэкенда (15 тестов)
just test-smoke     # smoke-тест API-клиента (24 проверки)
just e2e            # интеграционные e2e-тесты (4 теста в реальном браузере)
just dev            # бэкенд 3000 + фронт 8080, Ctrl+C гасит оба
```

Продолжить с незакрытых пунктов чеклиста «Прогресс» (ниже) и плана развития в `ROADMAP.md`. Продуктовый функционал **заморожен** — развивается только UI/UX по задачам из роадмапа (выполняются через GitHub issues/PR).

**Известный баг окружения (NixOS + rustup):** если `cargo build` падает с
`ld-wrapper.sh: No such file or directory`, обёртка lld в rustup сломана. Заменить её:

```bash
SYSROOT=$(rustc --print sysroot)
WRAPPER="$SYSROOT/lib/rustlib/x86_64-unknown-linux-gnu/bin/gcc-ld/ld.lld"
UNWRAPPED="$SYSROOT/lib/rustlib/x86_64-unknown-linux-gnu/bin/gcc-ld-unwrapped/ld.lld"
printf '#!/usr/bin/env bash\nexec "%s" "$@"\n' "$UNWRAPPED" > "$WRAPPER"
chmod +x "$WRAPPER"
```

**Известный баг окружения (NixOS, сломанный тулчейн):** если любой вызов `cargo`/`rustc`
падает с `error: command failed: 'cargo': No such file or directory (os error 2)`, а
`rustup show` пишет `(error reading rustc version)` — бинари тулчейна ссылаются на
glibc-интерпретатор из Nix-стора, который удалён GC. Проверить: `file
~/.rustup/toolchains/stable-x86_64-unknown-linux-gnu/bin/cargo` — в выводе будет
`interpreter /nix/store/...glibc...` и этого пути не существует. Лечится переустановкой
тулчейна (скачает ~200MB, свежие бинари ссылаются на валидный glibc):

```bash
rustup toolchain uninstall stable-x86_64-unknown-linux-gnu
rustup toolchain install stable-x86_64-unknown-linux-gnu
```

**Известный баг окружения (NixOS + Playwright):** скачанный Playwright-браузер
не стартует — не хватает системных библиотек (`libglib-2.0.so.0` и др. отсутствуют
в /nix/store). `just e2e` сам определяет NixOS и подставляет системный Chromium
(`PLAYWRIGHT_EXECUTABLE_PATH=/run/current-system/sw/bin/chromium`). Вручную:

```bash
PLAYWRIGHT_EXECUTABLE_PATH=/run/current-system/sw/bin/chromium npx playwright test
```

## Как запустить фронтенд против Rust-бэкенда (dev)

1. `just dev` (или два терминала: `just backend` + `just serve`)
2. В консоли браузера на странице: `localStorage.setItem('apiBase', 'http://127.0.0.1:3000')` и обновить страницу.
3. Для admin.html: токен `dev-token` (проверяется бэкендом; задаётся через env `OWNER_TOKEN`).

Стаб на Node (`tools/stub-server.mjs`, порт 4010) остаётся fallback'ом, если нужно проверить фронт без компиляции Rust.

**Rust-бэкенд** (`backend/`) — axum + in-memory хранилище, реализует контракт: слоты по правилам (30 мин, 09:00–18:00 UTC, 14 дней), бронирование с 409 на занятое время, owner-эндпоинты через `X-Owner-Token` = env `OWNER_TOKEN` (default `dev-token`), ошибки RFC7807, CORS-слой для dev (preflight 204 + `Access-Control-Allow-Private-Network: true`). В проде **`build_app`** раздаёт и API, и статику фронтенда из `STATIC_DIR` (default `frontend`) с того же origin — отдельный nginx не нужен; `build_router` — только API (используется в тестах). Структура: `models` (DTO по контракту, camelCase), `slots` (генерация), `handlers` (9 эндпоинтов), `error` (RFC7807), `auth` (токен), `cors`, `state` (Mutex<Store>).

Стаб на Node (`tools/stub-server.mjs`) — fallback-реализация того же контракта для проверки фронта без компиляции Rust. Prism оставлен только для проверки схем OpenAPI (stateless, подставляет случайные строки — для ручной проверки в браузере не подходит).

**CORS-заголовки обязательны**: фронт (8080) и API (3000/4010) — разные origins. Бэкенд и стаб отвечают на preflight полным набором: эхо `Access-Control-Request-Headers`, `Access-Control-Allow-Private-Network: true` (Private Network Access в Chrome/Firefox), чистый 204. Без этого админка с заголовком `X-Owner-Token` блокируется браузером.

В проде (Docker) axum раздаёт статику с того же origin — `apiBase` не нужен (по умолчанию пустая строка = тот же origin).

## Продакшн (Railway)

- **Публичная ссылка:** https://ai-for-developers-project-387-production-bb87.up.railway.app (гость), `/admin.html` (владелец, токен `dev-token`)
- Railway: проект `call-booking`, сервис `ai-for-developers-project-387` (id `49253e1a-9ca4-4721-b841-3dca4a903012`, env `9321b469-edbd-46e1-9589-11b661561937`). Сборка по `Dockerfile` из корня репо, запуск по `PORT`, `OWNER_TOKEN=dev-token`.
- Деплой **строго ручной** через Railway CLI из корня репозитория (GitHub-подключение **отвязано** — пуш в `main` деплой НЕ триггерит):
  ```bash
  railway up --service ai-for-developers-project-387 --environment production --project 736cb113-e32d-4e75-8836-73c6657a5bc2 --message "описание"
  ```
  CLI установлен локально (`~/.railway/bin/railway`, авторизация через `railway login`).
  **Внимание, параметры команд различаются:** `railway up`/`logs` принимают `--service`, а `railway status` — **НЕ принимает** `--service` (только `--project` + `--environment`). Вызов `railway status --service ...` падает с `error: unexpected argument '--service' found`.
  Проверка после деплоя (статус, лог деплоя, ответ приложения):
  ```bash
  railway status --project 736cb113-e32d-4e75-8836-73c6657a5bc2 --environment production
  railway logs --service ai-for-developers-project-387 --environment production --project 736cb113-e32d-4e75-8836-73c6657a5bc2 --deployment --lines 30
  curl -s https://ai-for-developers-project-387-production-bb87.up.railway.app/api/version
  ```
- `railway_redeploy` (MCP) переиспользует **старую сборку** — для выката нового кода не годится, только `railway up`.
- Сеть пользователя блокирует домен без VPN — для проверок прод-ссылки включать VPN.
- Данные in-memory: каждый деплой сбрасывает типы событий и бронирования.

## API-контракт (сводка)

| Метод | Путь | Роль | Назначение |
|---|---|---|---|
| GET | `/api/event-types` | все | список типов событий |
| GET | `/api/event-types/{id}` | все | детали типа |
| POST | `/api/event-types` | владелец | создать (тело: `EventTypeCreate`) |
| PUT | `/api/event-types/{id}` | владелец | обновить (тело: `EventTypeUpdate`) |
| DELETE | `/api/event-types/{id}` | владелец | удалить → 204 |
| GET | `/api/event-types/{id}/slots?from=ISO8601` | гость | слоты на 14 дней (`from` необязателен) |
| POST | `/api/bookings` | гость | забронировать (тело: `BookingRequest`) |
| GET | `/api/bookings` | владелец | предстоящие встречи |
| GET | `/api/version` | все | версия приложения (`{version}` из Cargo.toml) |

Сущности: `EventType{id,title,description?}`, `Slot{start,end,available}`, `Booking{id,eventTypeId,start,end,attendeeName,attendeeEmail}`, `BookingRequest{eventTypeId,start,attendeeName,attendeeEmail}`, `VersionInfo{version}`.

## Важные правила для агентов

1. **Контракт правится только через `spec/main.tsp`**, затем `npm run compile` в `spec/`. Не править `openapi.yaml` вручную.
2. TypeSpec v1.15: декораторы с аргументами требуют скобок (`@header("X-Owner-Token")`), объектные аргументы — через `#{}` (`@service(#{title: ...})`), версия API — через `@info(#{version: ...})` из `@typespec/openapi`.
3. Список-эндпоинты возвращают `200` с `[]` при пустом результате (НЕ 404).
4. Реализация фронта и бэка — строго по контракту, без заглядывания в реализацию другой части.
5. Docker локально установлен (`just docker-build` / `just docker-run`); прод-деплой — ручной `railway up` по `Dockerfile` (см. «Продакшн (Railway)»).
6. Язык общения с пользователем — **русский**.
7. **Строгое соблюдение Conventional Commits**: ВСЕ коммиты — только по Conventional Commits, включая коммиты агента (см. «Коммиты и релизы» ниже). Любой отход от формата недопустим: из типов коммитов вычисляются версия релиза и changelog.
8. **Мёрдж любых PR (включая release-PR от release-please) делает только пользователь** — агент PR не аппрувит и не мёрджит.
9. **В GitHub Actions (workflow `opencode.yml`) доступ за пределы воркспейса разрешён полностью**: env `OPENCODE_CONFIG_CONTENT` на шаге `Run opencode` перекрывает проектный `opencode.json` (`external_directory: allow`). Это сделано потому, что runner эфемерный, а без этого агент «зависал» на permission-запросах при обращении к путям вне репо (например, при визуальной проверке скриншотов через `/tmp` или `..`). Вне CI, локально, `opencode.json` применяется как есть (точечные `external_directory`-правила). Не рассчитывай на интерактивные подтверждения в CI — в неинтерактивном режиме `question` запрещён, любой `ask` в раннере вешает ран до таймаута.
10. Если release-please после мержа не создал GitHub Release (ошибка `Resource not accessible by integration`): причина — в истории `main` между merge-коммитом release-PR и HEAD есть коммит, изменяющий `.github/workflows/`. GitHub требует для создания release права на модификацию workflow, а `GITHUB_TOKEN` их не имеет. Лечится переписыванием истории (`git rebase --onto`), чтобы такой коммит не входил в `main` до выката релиза; после релиза workflow-коммит можно вернуть отдельным пушем.

## Коммиты и релизы (Conventional Commits + release-please)

**Соблюдение Conventional Commits — строго обязательное требование для любого коммита в репозитории** (ручные и агентские, всё, что попадает в `main`). Версия релиза и changelog рассчитываются автоматически из типов коммитов, поэтому отклонение от формата «ломает» релиз:

- `feat:` — новая возможность → **MINOR**
- `fix:` — исправление бага → **PATCH**
- `docs:`, `chore:`, `test:`, `refactor:`, `ci:`, `style:`, `perf:`, `build:` — версию не меняют
- Breaking change: `feat!:` / `fix!:` или строка `BREAKING CHANGE:` в теле → **MAJOR**
- Формат: `тип(область): описание`, например `feat: add owner dashboard`.

**release-please** (`release-please-config.json`, `.release-please-manifest.json`) настроен на **один пакет на корне репозитория** (путь `"."`, `release-type: rust`). Это сделано намеренно: релиз должен двигаться при изменении **любой** части проекта (сейчас продукт развивается только во фронтенде, а бэкенд заморожен — иначе релизы стояли бы на месте). Правила:

- пакет объявлен на **корне репо** → в расчёт берутся conventional-коммиты из всего дерева: фронтенд, бэкенд, спека, e2e, инструменты — любой `feat:`/`fix:` везде двигает версию (фронтовый `feat:` → **MINOR**);
- версия релиза пишется в `backend/Cargo.toml` и `backend/Cargo.lock` — через `extra-files` (jsonpath `$.package.version` и фильтр по `name` в `[[package]]`); версия в `main`-манифесте хранится по ключу `"."`;
- пуш в `main` → workflow `release-please.yml` создаёт/обновляет **release-PR** с changelog (`CHANGELOG.md` в корне) и предложенной версией;
- релизный компонент — `call-booking-backend` (`package-name` в конфиге), поэтому release-PR и теги имеют вид `chore(main): release call-booking-backend 0.x.y` и `call-booking-backend-v0.x.y` (`include-component-in-tag: true`) — совпадает с прошлыми релизами;
- синхронность версий: бэкенд отдаёт её через `GET /api/version`, фронт показывает в подвале;
- мёрдж release-PR → GitHub Release + тег + changelog;
- после мёрджа release-please делает авто-коммит `chore(main): release <версия>` — это нормально, трогать его не нужно.

**CI** (`ci.yml`): на каждый push — cargo test + smoke-тест API-клиента + Playwright e2e (реальный Chromium, основной сценарий бронирования).

## Прогресс

- [x] Этап 0–1: TypeSpec-контракт написан и скомпилирован (`spec/`), покрытие сценариев проверено
- [x] Этап 4: Frontend (`index.html` для гостя, `admin.html` для владельца), проверен против stateful-стаба (smoke-test.mjs: 24 ok)
- [x] Этап 3: Backend (axum + in-memory: 9 эндпоинтов, генерация слотов, X-Owner-Token, CORS, RFC7807)
- [x] Этап 5: Тесты (cargo test: 4 юнит слотов + 11 интеграционных; smoke-test.mjs против Rust: 24 ok)
- [x] Этап 7: Интеграционные e2e (Playwright, реальный Chromium, основной сценарий бронирования) + CI + release-please
- [x] Этап 6: Деплой (Dockerfile multi-stage в корне, axum раздаёт API+статику, запуск по `PORT`) — задеплоено на Railway, ссылка в README
- [x] Этап 8: Роадмап развития (`ROADMAP.md`) — план UI/UX, задачи выполняются через GitHub issues/PR
