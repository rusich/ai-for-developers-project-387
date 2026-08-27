import "@typespec/http";
import "@typespec/openapi";
import "@typespec/openapi3";

using TypeSpec.Http;
using TypeSpec.OpenAPI;

@service(#{title: "Call Booking"})
@info(#{version: "1.0.0"})
namespace CallBooking {

  // ── Доменные модели ──────────────────────────────────────────

  @doc("Тип события, который создаёт владелец")
  model EventType {
    @doc("Уникальный идентификатор")
    id: string;

    @doc("Название типа события")
    @minLength(1)
    title: string;

    @doc("Описание типа события")
    description?: string;
  }

  @doc("Запрос на создание типа события")
  model EventTypeCreate {
    @minLength(1)
    title: string;
    description?: string;
  }

  @doc("Запрос на обновление типа события (все поля необязательны)")
  model EventTypeUpdate {
    @minLength(1)
    title?: string;
    description?: string;
  }

  @doc("Временной слот для бронирования")
  model Slot {
    @doc("Начало слота (UTC, ISO 8601)")
    start: utcDateTime;

    @doc("Конец слота (UTC, ISO 8601)")
    end: utcDateTime;

    @doc("true, если слот свободен и доступен для бронирования")
    available: boolean;
  }

  @doc("Созданное бронирование")
  model Booking {
    @doc("Уникальный идентификатор бронирования")
    id: string;

    @doc("Идентификатор типа события")
    eventTypeId: string;

    @doc("Начало бронирования (UTC, ISO 8601)")
    start: utcDateTime;

    @doc("Конец бронирования (UTC, ISO 8601)")
    end: utcDateTime;

    @doc("Имя гостя")
    @minLength(1)
    attendeeName: string;

    @doc("Email гостя")
    @format("email")
    attendeeEmail: string;
  }

  @doc("Запрос на создание бронирования")
  model BookingRequest {
    @doc("Идентификатор типа события")
    eventTypeId: string;

    @doc("Начало бронируемого слота (UTC, ISO 8601)")
    start: utcDateTime;

    @doc("Имя гостя")
    @minLength(1)
    attendeeName: string;

    @doc("Email гостя")
    @format("email")
    attendeeEmail: string;
  }

  @doc("Информация о версии приложения")
  model VersionInfo {
    @doc("Версия приложения (из Cargo.toml)")
    version: string;
  }

  // ── Ошибки (RFC7807-стиль) ───────────────────────────────────

  @doc("Ошибка в формате RFC7807 (Problem Details)")
  model Error {
    @doc("URI-идентификатор типа ошибки")
    type: string;

    @doc("Краткое читаемое название ошибки")
    title: string;

    @doc("HTTP-статус код")
    status: int32;

    @doc("Детальное описание ошибки")
    detail: string;
  }

  @error
  model BadRequestError {
    @statusCode statusCode: 400;
    @body body: Error;
  }

  @error
  model UnauthorizedError {
    @statusCode statusCode: 401;
    @body body: Error;
  }

  @error
  model NotFoundError {
    @statusCode statusCode: 404;
    @body body: Error;
  }

  @error
  model ConflictError {
    @statusCode statusCode: 409;
    @body body: Error;
  }

  // ── Эндпоинты ────────────────────────────────────────────────

  @route("/api/event-types")
  interface EventTypes {
    @doc("Получить список всех типов событий")
    @get list(): EventType[];

    @doc("Получить тип события по идентификатору")
    @get get(@path id: string): EventType | NotFoundError;

    @doc("Создать новый тип события. Требует заголовок X-Owner-Token.")
    @post create(
      @header("X-Owner-Token") ownerToken: string,
      @body body: EventTypeCreate
    ): EventType | BadRequestError | UnauthorizedError;

    @doc("Обновить тип события. Требует заголовок X-Owner-Token.")
    @put update(
      @path id: string,
      @header("X-Owner-Token") ownerToken: string,
      @body body: EventTypeUpdate
    ): EventType | NotFoundError | UnauthorizedError | BadRequestError;

    @doc("Удалить тип события. Требует заголовок X-Owner-Token.")
    @delete remove(
      @path id: string,
      @header("X-Owner-Token") ownerToken: string
    ): void | NotFoundError | UnauthorizedError;

    @doc("Получить слоты на 14 дней начиная с from (по умолчанию — сегодня). Окно 09:00–18:00 UTC, слоты по 30 минут.")
    @route("/{id}/slots")
    @get slots(
      @path id: string,
      @query from?: utcDateTime
    ): Slot[] | NotFoundError;
  }

  @route("/api/bookings")
  interface Bookings {
    @doc("Забронировать свободный слот")
    @post book(
      @body body: BookingRequest
    ): Booking | BadRequestError | NotFoundError | ConflictError;

    @doc("Получить список предстоящих бронирований (все типы событий). Требует заголовок X-Owner-Token.")
    @get list(
      @header("X-Owner-Token") ownerToken: string
    ): Booking[] | UnauthorizedError;
  }

  @route("/api/version")
  interface Version {
    @doc("Получить версию приложения")
    @get get(): VersionInfo;
  }
}
