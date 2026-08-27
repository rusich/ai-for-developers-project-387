// CORS-слой. Фронт (8080) и API (3000) — разные origins, поэтому нужен
// полный preflight: чистый 204, эхо Access-Control-Request-Headers,
// Access-Control-Allow-Private-Network: true (Private Network Access в браузерах).

use axum::body::Body;
use axum::extract::Request;
use axum::http::header::{
    ACCESS_CONTROL_ALLOW_HEADERS, ACCESS_CONTROL_ALLOW_METHODS, ACCESS_CONTROL_ALLOW_ORIGIN,
    ACCESS_CONTROL_REQUEST_HEADERS, ORIGIN, VARY,
};
use axum::http::{HeaderValue, StatusCode};
use axum::middleware::Next;
use axum::response::Response;

const ALLOW_PRIVATE_NETWORK: &str = "access-control-allow-private-network";

pub async fn cors_layer(req: Request, next: Next) -> Result<Response, StatusCode> {
    // Echo origin, чтобы браузер пропустил чтение ответа.
    let origin = req
        .headers()
        .get(ORIGIN)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("*")
        .to_string();
    let origin = HeaderValue::from_str(&origin).unwrap_or_else(|_| HeaderValue::from_static("*"));

    // Preflight (OPTIONS) — отвечаем сразу, без передачи дальше.
    if req.method() == axum::http::Method::OPTIONS {
        let requested_headers = req
            .headers()
            .get(ACCESS_CONTROL_REQUEST_HEADERS)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");

        let mut res = Response::builder()
            .status(StatusCode::NO_CONTENT)
            .body(Body::empty())
            .expect("build preflight response");

        let headers = res.headers_mut();
        headers.insert(ACCESS_CONTROL_ALLOW_ORIGIN, origin.clone());
        headers.insert(
            ACCESS_CONTROL_ALLOW_HEADERS,
            HeaderValue::from_str(&format!("Content-Type, X-Owner-Token, {}", requested_headers))
                .unwrap_or_else(|_| HeaderValue::from_static("Content-Type, X-Owner-Token")),
        );
        headers.insert(
            ACCESS_CONTROL_ALLOW_METHODS,
            HeaderValue::from_static("GET, POST, PUT, DELETE, OPTIONS"),
        );
        headers.insert(
            axum::http::header::HeaderName::from_static(ALLOW_PRIVATE_NETWORK),
            HeaderValue::from_static("true"),
        );
        headers.insert(VARY, HeaderValue::from_static("Origin, Access-Control-Request-Headers"));
        return Ok(res);
    }

    let mut res = next.run(req).await;

    res.headers_mut().insert(ACCESS_CONTROL_ALLOW_ORIGIN, origin);

    Ok(res)
}
