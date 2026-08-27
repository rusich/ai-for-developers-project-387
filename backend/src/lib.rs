pub mod auth;
pub mod cors;
pub mod error;
pub mod handlers;
pub mod models;
pub mod slots;
pub mod state;

use std::path::PathBuf;

use axum::body::Body;
use axum::extract::DefaultBodyLimit;
use axum::http::Request;
use axum::middleware::from_fn;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use tower::util::ServiceExt;
use tower_http::services::ServeDir;

use crate::state::AppState;

pub fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/api/event-types", get(handlers::list_event_types).post(handlers::create_event_type))
        .route(
            "/api/event-types/{id}",
            get(handlers::get_event_type)
                .put(handlers::update_event_type)
                .delete(handlers::delete_event_type),
        )
        .route("/api/event-types/{id}/slots", get(handlers::get_slots))
        .route("/api/bookings", post(handlers::create_booking).get(handlers::list_bookings))
        .route("/api/version", get(handlers::get_version))
        .fallback(not_found)
        .layer(from_fn(cors::cors_layer))
        .layer(DefaultBodyLimit::max(64 * 1024))
        .with_state(state)
}

// Продакшн-приложение: тот же API + раздача статики фронтенда с того же origin
// (единый контейнер, без отдельного nginx). Неизвестные /api-пути по-прежнему
// возвращают JSON-404 по RFC7807, остальное отдаётся из static_dir.
pub fn build_app(state: AppState, static_dir: impl Into<PathBuf>) -> Router {
    let static_dir = static_dir.into();
    let static_handler = move |req: Request<Body>| {
        let static_dir = static_dir.clone();
        async move {
            if req.uri().path().starts_with("/api") {
                return crate::error::ApiError::NotFound("Ресурс не найден.".to_string())
                    .into_response();
            }
            let resp = ServeDir::new(&static_dir)
                .oneshot(req)
                .await
                .unwrap_or_else(|err| match err {});
            resp.map(|body| Body::new(body))
        }
    };
    build_router(state).fallback(static_handler)
}

async fn not_found() -> Response {
    crate::error::ApiError::NotFound("Ресурс не найден.".to_string()).into_response()
}
