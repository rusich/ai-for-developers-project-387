// Интеграционные тесты API по контракту.
// Запуск: cargo test --manifest-path backend/Cargo.toml

use axum::body::Body;
use axum::http::{header, Method, Request, StatusCode};
use axum::Router;
use call_booking_backend::{build_router, state::new_state};
use chrono::{Datelike, Timelike};
use http_body_util::BodyExt;
use serde_json::{json, Value};
use tower::ServiceExt;

const TOKEN: &str = "dev-token";
const OWNER_HEADER: (&str, &str) = ("x-owner-token", TOKEN);

fn app() -> Router {
    build_router(new_state())
}

async fn send(
    router: Router,
    method: Method,
    uri: &str,
    body: Option<Value>,
    headers: Vec<(&str, &str)>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder().method(method).uri(uri);
    for (k, v) in headers {
        builder = builder.header(k, v);
    }
    // Включаем Origin, чтобы имитировать браузер и проверить CORS-заголовки.
    let builder = builder.header(header::ORIGIN, "http://127.0.0.1:8080");
    let req = if let Some(b) = body {
        builder
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(b.to_string()))
            .unwrap()
    } else {
        builder.body(Body::empty()).unwrap()
    };
    let response = router.oneshot(req).await.unwrap();
    let status = response.status();
    let bytes = response.into_body().collect().await.unwrap().to_bytes();
    let value: Value = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap_or(Value::Null)
    };
    (status, value)
}

async fn get(router: &Router, uri: &str) -> (StatusCode, Value) {
    send(router.clone(), Method::GET, uri, None, vec![]).await
}

// ── Создание типа события ────────────────────────────────────

async fn create_type(router: &Router, title: &str) -> Value {
    let (status, body) = send(
        router.clone(),
        Method::POST,
        "/api/event-types",
        Some(json!({ "title": title })),
        vec![OWNER_HEADER],
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    body
}

// ── Тесты ────────────────────────────────────────────────────

#[tokio::test]
async fn event_type_crud() {
    let router = app();

    // пустой список
    let (status, body) = get(&router, "/api/event-types").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(body, json!([]));

    // создание
    let created = create_type(&router, "Консультация").await;
    assert_eq!(created["title"], json!("Консультация"));
    assert!(created["id"].is_string());

    // список вырос
    let (_, list) = get(&router, "/api/event-types").await;
    assert_eq!(list.as_array().unwrap().len(), 1);

    // получение по id
    let id = created["id"].as_str().unwrap();
    let (status, fetched) = get(&router, &format!("/api/event-types/{}", id)).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(fetched["id"], json!(id));

    // обновление
    let (status, updated) = send(
        router.clone(),
        Method::PUT,
        &format!("/api/event-types/{}", id),
        Some(json!({ "title": "Стратсессия" })),
        vec![OWNER_HEADER],
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(updated["title"], json!("Стратсессия"));

    // удаление
    let (status, body) = send(
        router.clone(),
        Method::DELETE,
        &format!("/api/event-types/{}", id),
        None,
        vec![OWNER_HEADER],
    )
    .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    assert_eq!(body, Value::Null);

    let (_, list) = get(&router, "/api/event-types").await;
    assert_eq!(list.as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn slots_generation() {
    let router = app();
    let et = create_type(&router, "Встреча").await;
    let id = et["id"].as_str().unwrap();

    let (status, body) = get(&router, &format!("/api/event-types/{}/slots", id)).await;
    assert_eq!(status, StatusCode::OK);
    let slots = body.as_array().unwrap();
    assert_eq!(slots.len(), 14 * 18);

    let first = &slots[0];
    assert!(first["start"].is_string());
    assert!(first["end"].is_string());
    assert!(first["available"].is_boolean());
    // первый слот окна — 09:00 UTC
    let first_start = chrono::DateTime::parse_from_rfc3339(first["start"].as_str().unwrap()).unwrap();
    assert_eq!((first_start.hour(), first_start.minute()), (9, 0));
    // слоты выровнены по 30 минут
    for s in slots {
        let start = chrono::DateTime::parse_from_rfc3339(s["start"].as_str().unwrap()).unwrap();
        assert_eq!(start.timestamp_millis() % (30 * 60_000), 0);
    }

    // из всех 7 дней недели
    let days: std::collections::HashSet<_> = slots
        .iter()
        .map(|s| {
            let start = s["start"].as_str().unwrap();
            let d = chrono::DateTime::parse_from_rfc3339(start).unwrap();
            d.weekday().num_days_from_monday()
        })
        .collect();
    assert_eq!(days.len(), 7);
}

#[tokio::test]
async fn slots_from_shifts_window() {
    let router = app();
    let et = create_type(&router, "Встреча").await;
    let id = et["id"].as_str().unwrap();

    let (_, base) = get(&router, &format!("/api/event-types/{}/slots", id)).await;
    let from = (chrono::Utc::now() + chrono::Duration::days(7))
        .to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let (_, shifted) = get(
        &router,
        &format!("/api/event-types/{}/slots?from={}", id, from),
    )
    .await;
    assert_eq!(base.as_array().unwrap().len(), shifted.as_array().unwrap().len());
    assert!(
        shifted.as_array().unwrap()[0]["start"]
            .as_str()
            .unwrap()
            > base.as_array().unwrap()[0]["start"].as_str().unwrap()
    );
}

#[tokio::test]
async fn booking_conflict_returns_409() {
    let router = app();
    let et = create_type(&router, "Встреча").await;
    let id = et["id"].as_str().unwrap();

    let (_, slots) = get(&router, &format!("/api/event-types/{}/slots", id)).await;
    let free = slots
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["available"] == json!(true))
        .unwrap()
        .clone();
    let start = free["start"].as_str().unwrap();

    let body = json!({
        "eventTypeId": id,
        "start": start,
        "attendeeName": "Иван",
        "attendeeEmail": "ivan@example.com",
    });

    let (status, booking) = send(
        router.clone(),
        Method::POST,
        "/api/bookings",
        Some(body.clone()),
        vec![],
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(booking["attendeeName"], json!("Иван"));

    // повторное бронирование того же времени → 409
    let (status, err) = send(
        router.clone(),
        Method::POST,
        "/api/bookings",
        Some(body),
        vec![],
    )
    .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(err["status"], json!(409));
    assert!(err["detail"].is_string());
    assert!(err["type"].is_string());
}

#[tokio::test]
async fn booking_validation_errors() {
    let router = app();
    let et = create_type(&router, "Встреча").await;
    let id = et["id"].as_str().unwrap();

    // пустое тело → 400
    let (status, _) = send(
        router.clone(),
        Method::POST,
        "/api/bookings",
        Some(json!({})),
        vec![],
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // невалидный email → 400
    let (_, slots) = get(&router, &format!("/api/event-types/{}/slots", id)).await;
    let start = slots
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["available"] == json!(true))
        .unwrap()["start"]
        .as_str()
        .unwrap();
    let (status, _) = send(
        router.clone(),
        Method::POST,
        "/api/bookings",
        Some(json!({
            "eventTypeId": id,
            "start": start,
            "attendeeName": "Иван",
            "attendeeEmail": "не-email",
        })),
        vec![],
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);

    // несуществующий тип события → 404
    let (status, _) = send(
        router.clone(),
        Method::POST,
        "/api/bookings",
        Some(json!({
            "eventTypeId": "00000000-0000-0000-0000-000000000000",
            "start": start,
            "attendeeName": "Иван",
            "attendeeEmail": "ivan@example.com",
        })),
        vec![],
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn owner_auth_required() {
    let router = app();

    // без токена → 401
    let (status, err) = send(
        router.clone(),
        Method::POST,
        "/api/event-types",
        Some(json!({ "title": "x" })),
        vec![],
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
    assert_eq!(err["status"], json!(401));

    // неверный токен → 401
    let (status, _) = send(
        router.clone(),
        Method::POST,
        "/api/event-types",
        Some(json!({ "title": "x" })),
        vec![("x-owner-token", "wrong")],
    )
    .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    // GET /api/bookings без токена → 401
    let (status, _) = send(router.clone(), Method::GET, "/api/bookings", None, vec![]).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn bookings_list_requires_token_and_returns_upcoming() {
    let router = app();
    let et = create_type(&router, "Встреча").await;
    let id = et["id"].as_str().unwrap();

    let (_, slots) = get(&router, &format!("/api/event-types/{}/slots", id)).await;
    let start = slots
        .as_array()
        .unwrap()
        .iter()
        .find(|s| s["available"] == json!(true))
        .unwrap()["start"]
        .as_str()
        .unwrap();

    send(
        router.clone(),
        Method::POST,
        "/api/bookings",
        Some(json!({
            "eventTypeId": id,
            "start": start,
            "attendeeName": "Иван",
            "attendeeEmail": "ivan@example.com",
        })),
        vec![],
    )
    .await;

    let (status, bookings) = send(
        router.clone(),
        Method::GET,
        "/api/bookings",
        None,
        vec![OWNER_HEADER],
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(bookings.as_array().unwrap().len(), 1);
    assert_eq!(bookings[0]["attendeeName"], json!("Иван"));
    assert!(bookings[0]["eventTypeId"].is_string());
}

#[tokio::test]
async fn unknown_event_type_returns_404() {
    let router = app();

    let (status, _) = get(
        &router,
        "/api/event-types/00000000-0000-0000-0000-000000000000",
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, _) = get(
        &router,
        "/api/event-types/00000000-0000-0000-0000-000000000000/slots",
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn cors_preflight() {
    let router = app();

    let response = router
        .oneshot(
            Request::builder()
                .method(Method::OPTIONS)
                .uri("/api/event-types")
                .header(header::ORIGIN, "http://127.0.0.1:8080")
                .header("access-control-request-method", "POST")
                .header("access-control-request-headers", "x-owner-token")
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NO_CONTENT);
    assert_eq!(
        response.headers()["access-control-allow-origin"],
        "http://127.0.0.1:8080"
    );
    assert_eq!(
        response.headers()["access-control-allow-private-network"],
        "true"
    );
    assert!(response.headers()["access-control-allow-headers"]
        .to_str()
        .unwrap()
        .contains("X-Owner-Token"));
}

#[tokio::test]
async fn version_endpoint_returns_semver() {
    let router = app();

    let (status, body) = get(&router, "/api/version").await;
    assert_eq!(status, StatusCode::OK);
    let v = body["version"].as_str().unwrap();
    assert_eq!(v, env!("CARGO_PKG_VERSION"));
    assert!(!v.is_empty());
}

#[tokio::test]
async fn invalid_json_body_returns_400() {
    let router = app();
    let response = router
        .oneshot(
            Request::builder()
                .method(Method::POST)
                .uri("/api/event-types")
                .header(header::CONTENT_TYPE, "application/json")
                .header(OWNER_HEADER.0, OWNER_HEADER.1)
                .body(Body::from("{not valid json"))
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}
