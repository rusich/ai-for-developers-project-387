use call_booking_backend::{build_app, state::new_state};

#[tokio::main]
async fn main() {
    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let addr = format!("0.0.0.0:{}", port);

    // Директория статики фронтенда (в Docker: /app/frontend, WORKDIR=/app → "frontend").
    let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| "frontend".to_string());

    let app = build_app(new_state(), static_dir);

    let listener = tokio::net::TcpListener::bind(&addr).await.expect("bind failed");
    println!("Call Booking API + статика на http://{addr}");
    axum::serve(listener, app).await.expect("server error");
}
