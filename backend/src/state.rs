// In-memory хранилище (по заданию шага: БД не нужна, данные сбрасываются при перезапуске).

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::models::{Booking, EventType};

#[derive(Default)]
pub struct Store {
    pub event_types: HashMap<Uuid, EventType>,
    pub bookings: Vec<Booking>,
}

pub type AppState = Arc<Mutex<Store>>;

pub fn new_state() -> AppState {
    let store = Store::default();
    Arc::new(Mutex::new(store))
}
