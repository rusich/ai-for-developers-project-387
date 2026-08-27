// Ошибки API в формате RFC7807 (Problem Details): { type, title, status, detail }

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

use crate::models::ErrorBody;

#[derive(Debug)]
pub enum ApiError {
    BadRequest(String),
    Unauthorized(String),
    NotFound(String),
    Conflict(String),
}

impl ApiError {
    pub fn status(&self) -> StatusCode {
        match self {
            ApiError::BadRequest(_) => StatusCode::BAD_REQUEST,
            ApiError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            ApiError::NotFound(_) => StatusCode::NOT_FOUND,
            ApiError::Conflict(_) => StatusCode::CONFLICT,
        }
    }

    pub fn title(&self) -> &'static str {
        match self {
            ApiError::BadRequest(_) => "Bad Request",
            ApiError::Unauthorized(_) => "Unauthorized",
            ApiError::NotFound(_) => "Not Found",
            ApiError::Conflict(_) => "Conflict",
        }
    }

    fn detail(&self) -> &str {
        match self {
            ApiError::BadRequest(d)
            | ApiError::Unauthorized(d)
            | ApiError::NotFound(d)
            | ApiError::Conflict(d) => d,
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = ErrorBody {
            r#type: "about:blank".to_string(),
            title: self.title().to_string(),
            status: self.status().as_u16(),
            detail: self.detail().to_string(),
        };
        (self.status(), Json(body)).into_response()
    }
}

// Ловим невалидный JSON в теле запроса → 400 по контракту
pub async fn json_rejection(err: axum::extract::rejection::JsonRejection) -> Response {
    ApiError::BadRequest(format!("Некорректное тело запроса: {}", err.body_text())).into_response()
}

// Резервный 404 для неизвестных путей
pub async fn not_found() -> Response {
    ApiError::NotFound("Ресурс не найден.".to_string()).into_response()
}

pub fn invalid_json() -> Response {
    Json(json!({
        "type": "about:blank",
        "title": "Bad Request",
        "status": 400,
        "detail": "Тело запроса должно быть валидным JSON.",
    }))
    .into_response()
}
