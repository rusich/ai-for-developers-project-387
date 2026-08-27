// Идентификация владельца: заголовок X-Owner-Token = значению из env OWNER_TOKEN.

use axum::http::HeaderMap;

use crate::error::ApiError;

pub const DEFAULT_OWNER_TOKEN: &str = "dev-token";

pub fn owner_token() -> String {
    std::env::var("OWNER_TOKEN").unwrap_or_else(|_| DEFAULT_OWNER_TOKEN.to_string())
}

pub fn check_owner(headers: &HeaderMap) -> Result<(), ApiError> {
    let expected = owner_token();
    let token = headers
        .get("x-owner-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if token == expected {
        Ok(())
    } else {
        Err(ApiError::Unauthorized(
            "Отсутствует или неверен заголовок X-Owner-Token.".to_string(),
        ))
    }
}
