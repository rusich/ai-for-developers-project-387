# Multi-stage: собранный Rust-бинарь + статика фронтенда в одном образе.
# axum раздаёт и API, и статику (без отдельного nginx).
# Контекст сборки — корень репозитория: docker build .

# ── Сборка ─────────────────────────────────────────────────────
FROM rust:1.98-slim-bookworm AS builder
WORKDIR /build

# Зависимости собираем один раз отдельно от исходников (кэш слоёв).
COPY backend/Cargo.toml backend/Cargo.lock ./
RUN mkdir src \
    && echo 'fn main() {}' > src/main.rs \
    && touch src/lib.rs \
    && cargo build --release --locked \
    && rm -rf src

COPY backend/src ./src
RUN touch src/main.rs src/lib.rs \
    && cargo build --release --locked

# ── Рантайм ────────────────────────────────────────────────────
FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /build/target/release/call-booking-backend /app/call-booking-backend
COPY frontend /app/frontend

# Приложение слушает порт из переменной окружения PORT (default 3000).
ENV PORT=3000
EXPOSE ${PORT}

CMD ["/app/call-booking-backend"]
