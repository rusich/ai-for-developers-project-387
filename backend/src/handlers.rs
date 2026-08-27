// Хендлеры всех 8 эндпоинтов контракта.

use axum::extract::rejection::JsonRejection;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use chrono::{DateTime, Utc};
use serde::Deserialize;
use uuid::Uuid;

use crate::auth::check_owner;
use crate::error::ApiError;
use crate::models::{
    Booking, BookingRequest, EventType, EventTypeCreate, EventTypeUpdate, VersionInfo,
};
use crate::slots::{find_slot, generate_slots};
use crate::state::AppState;

// Версия приложения берётся из Cargo.toml на этапе компиляции;
// release-please синхронизирует её с релизами (release-type: rust).
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Deserialize)]
pub struct SlotsQuery {
    pub from: Option<DateTime<Utc>>,
}

fn is_email(v: &str) -> bool {
    !v.is_empty()
        && v.contains('@')
        && v.split('@').all(|part| !part.is_empty())
        && v.split('@').count() == 2
}

fn non_empty(s: &str) -> bool {
    !s.trim().is_empty()
}

// ── Event types ──────────────────────────────────────────────

pub async fn list_event_types(State(state): State<AppState>) -> Response {
    let store = state.lock().await;
    let items: Vec<EventType> = store.event_types.values().cloned().collect();
    Json(items).into_response()
}

fn parse_event_type_id(raw: &str) -> Result<Uuid, ApiError> {
    Uuid::parse_str(raw)
        .map_err(|_| ApiError::NotFound(format!("Тип события {} не найден.", raw)))
}

pub async fn get_event_type(
    State(state): State<AppState>,
    Path(raw_id): Path<String>,
) -> Result<Response, ApiError> {
    let id = parse_event_type_id(&raw_id)?;
    let store = state.lock().await;
    let et = store
        .event_types
        .get(&id)
        .ok_or_else(|| ApiError::NotFound(format!("Тип события {} не найден.", id)))?;
    Ok(Json(et).into_response())
}

pub async fn create_event_type(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Result<Json<EventTypeCreate>, JsonRejection>,
) -> Result<Response, ApiError> {
    let Json(body) = body.map_err(|_| {
        ApiError::BadRequest("Тело запроса должно быть валидным JSON.".to_string())
    })?;
    check_owner(&headers)?;
    if !non_empty(&body.title) {
        return Err(ApiError::BadRequest(
            "Поле title обязательно и не должно быть пустым.".to_string(),
        ));
    }
    let et = EventType {
        id: Uuid::new_v4(),
        title: body.title.trim().to_string(),
        description: body
            .description
            .map(|d| d.trim().to_string())
            .filter(|d| !d.is_empty()),
    };
    let mut store = state.lock().await;
    store.event_types.insert(et.id, et.clone());
    Ok(Json(et).into_response())
}

pub async fn update_event_type(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(raw_id): Path<String>,
    body: Result<Json<EventTypeUpdate>, JsonRejection>,
) -> Result<Response, ApiError> {
    let Json(body) = body.map_err(|_| {
        ApiError::BadRequest("Тело запроса должно быть валидным JSON.".to_string())
    })?;
    check_owner(&headers)?;
    let id = parse_event_type_id(&raw_id)?;
    let mut store = state.lock().await;
    let et = store
        .event_types
        .get_mut(&id)
        .ok_or_else(|| ApiError::NotFound(format!("Тип события {} не найден.", id)))?;
    if let Some(title) = body.title {
        if !non_empty(&title) {
            return Err(ApiError::BadRequest(
                "Поле title не должно быть пустым.".to_string(),
            ));
        }
        et.title = title.trim().to_string();
    }
    if let Some(desc) = body.description {
        et.description = Some(desc.trim().to_string());
    }
    Ok(Json(et).into_response())
}

pub async fn delete_event_type(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(raw_id): Path<String>,
) -> Result<StatusCode, ApiError> {
    check_owner(&headers)?;
    let id = parse_event_type_id(&raw_id)?;
    let mut store = state.lock().await;
    if store.event_types.remove(&id).is_none() {
        return Err(ApiError::NotFound(format!("Тип события {} не найден.", id)));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn get_slots(
    State(state): State<AppState>,
    Path(raw_id): Path<String>,
    Query(query): Query<SlotsQuery>,
) -> Result<Response, ApiError> {
    let id = parse_event_type_id(&raw_id)?;
    let store = state.lock().await;
    if !store.event_types.contains_key(&id) {
        return Err(ApiError::NotFound(format!("Тип события {} не найден.", id)));
    }
    let slots = generate_slots(query.from, &store.bookings);
    Ok(Json(slots).into_response())
}

// ── Bookings ─────────────────────────────────────────────────

pub async fn create_booking(
    State(state): State<AppState>,
    body: Result<Json<BookingRequest>, JsonRejection>,
) -> Result<Response, ApiError> {
    let Json(body) = body.map_err(|_| {
        ApiError::BadRequest("Тело запроса должно быть валидным JSON.".to_string())
    })?;
    if !non_empty(&body.attendee_name) {
        return Err(ApiError::BadRequest(
            "Поле attendeeName обязательно.".to_string(),
        ));
    }
    if !is_email(&body.attendee_email) {
        return Err(ApiError::BadRequest(
            "Поле attendeeEmail должно быть валидным email.".to_string(),
        ));
    }

    let mut store = state.lock().await;
    if !store.event_types.contains_key(&body.event_type_id) {
        return Err(ApiError::NotFound(format!(
            "Тип события {} не найден.",
            body.event_type_id
        )));
    }

    let slot = find_slot(body.start, &store.bookings).ok_or_else(|| {
        if store.bookings.iter().any(|b| b.start == body.start) {
            ApiError::Conflict("Это время уже занято.".to_string())
        } else {
            ApiError::BadRequest(
                "Время start не попадает в сетку доступных слотов.".to_string(),
            )
        }
    })?;

    let booking = Booking {
        id: Uuid::new_v4(),
        event_type_id: body.event_type_id,
        start: slot.0,
        end: slot.1,
        attendee_name: body.attendee_name.trim().to_string(),
        attendee_email: body.attendee_email.trim().to_string(),
    };
    store.bookings.push(booking.clone());
    Ok(Json(booking).into_response())
}

// ── Версия ───────────────────────────────────────────────────

pub async fn get_version() -> Json<VersionInfo> {
    Json(VersionInfo {
        version: APP_VERSION.to_string(),
    })
}

pub async fn list_bookings(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    check_owner(&headers)?;
    let store = state.lock().await;
    let now = Utc::now();
    let mut upcoming: Vec<Booking> = store
        .bookings
        .iter()
        .filter(|b| b.end > now)
        .cloned()
        .collect();
    upcoming.sort_by_key(|a| a.start);
    Ok(Json(upcoming).into_response())
}
