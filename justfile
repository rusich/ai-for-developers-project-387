# Call Booking — команды для разработки
# Список команд: just --list

# установка всех зависимостей
install:
    cd spec && npm install
    cd tools && npm install
    cd e2e && npm install

# перекомпиляция контракта TypeSpec → OpenAPI
compile-spec:
    cd spec && npm run compile

# Rust-бэкенд (порт 3000)
backend:
    cd backend && cargo run

# тесты бэкенда (cargo test)
test:
    cd backend && cargo test

# Stateful dev-стаб API на Node (порт 4010) — fallback, если Rust-бэкенд не нужен
stub:
    node tools/stub-server.mjs 4010

# Prism-мок API по контракту (порт 4010), stateless — только для проверки схем
mock:
    cd tools && npx prism mock ../spec/openapi/openapi.yaml -p 4010

# раздача статики фронтенда (порт 8080)
serve:
    cd frontend && python3 -m http.server 8080

# запуск Rust-бэкенда + фронтенда одной командой для проверки в браузере
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    # освобождаем порты, если остались висящие процессы от прошлого запуска
    for port in 3000 8080; do
        pids=$(lsof -ti tcp:$port 2>/dev/null || true)
        if [ -n "$pids" ]; then
            echo "  Порт $port занят (pid: $pids) — завершаю."
            kill $pids 2>/dev/null || true
            sleep 1
        fi
    done

    CLEANED=0
    cleanup() {
        [ "$CLEANED" -eq 1 ] && return 0
        CLEANED=1
        echo ""
        echo "  Останавливаю бэкенд и фронтенд..."
        [ -n "${BACKEND_PID:-}" ] && kill "$BACKEND_PID" 2>/dev/null || true
        [ -n "${SERVE_PID:-}" ] && kill "$SERVE_PID" 2>/dev/null || true
        sleep 1
        # страховка: добиваем, если что-то осталось висеть
        for port in 3000 8080; do
            pids=$(lsof -ti tcp:$port 2>/dev/null || true)
            [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
        done
        wait 2>/dev/null || true
    }
    # Ctrl+C → останавливаем процессы и выходим с кодом 0,
    # чтобы just не показывал «recipe failed with exit code 130».
    trap 'cleanup; exit 0' INT TERM
    trap cleanup EXIT

    # собираем бинарь заранее и запускаем его НАПРЯМУЮ (без cargo-обёртки),
    # чтобы $! был PID самого сервера, а не под-оболочки
    echo "  Сборка бэкенда..."
    (cd backend && cargo build) &> /tmp/call-booking-backend-build.log
    ./backend/target/debug/call-booking-backend &> /tmp/call-booking-backend.log &
    BACKEND_PID=$!

    python3 -m http.server 8080 --directory frontend &> /dev/null &
    SERVE_PID=$!

    sleep 2
    echo ''
    echo '  Гость:     http://127.0.0.1:8080'
    echo '  Владелец:  http://127.0.0.1:8080/admin.html  (токен: dev-token)'
    echo ''
    echo '  В консоли браузера (для работы с Rust-бэкендом):'
    echo '    localStorage.setItem("apiBase", "http://127.0.0.1:3000")'
    echo ''
    echo '  Ctrl+C — остановить оба процесса.'
    wait

# smoke-тест клиента против Rust-бэкенда (или стаба)
test-smoke:
    node frontend/smoke-test.mjs http://127.0.0.1:3000

# сборка Docker-образа (Dockerfile в корне, context = корень репозитория)
docker-build:
    docker build -t call-booking .

# запуск контейнера (порт 3000, токен dev-token)
docker-run:
    docker run --rm -p 3000:3000 -e OWNER_TOKEN=dev-token call-booking

# установка e2e-зависимостей + браузера Chromium для Playwright
install-e2e:
    cd e2e && npm install && npx playwright install chromium

# интеграционные e2e-тесты (Playwright): собирает бэкенд, поднимает 3000+8080
# и гоняет сценарии в реальном браузере
e2e:
    #!/usr/bin/env bash
    set -euo pipefail
    for port in 3000 8080; do
        pids=$(lsof -ti tcp:$port 2>/dev/null || true)
        if [ -n "$pids" ]; then
            echo "  Порт $port занят (pid: $pids) — завершаю."
            kill $pids 2>/dev/null || true
            sleep 1
        fi
    done
    (cd backend && cargo build)
    # NixOS: Playwright-браузер без системных библиотек не стартует — берём системный Chromium
    if [ -x /run/current-system/sw/bin/chromium ]; then
        export PLAYWRIGHT_EXECUTABLE_PATH="${PLAYWRIGHT_EXECUTABLE_PATH:-/run/current-system/sw/bin/chromium}"
    fi
    cd e2e && npx playwright test
