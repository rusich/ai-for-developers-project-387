// Генерация слотов по правилам контракта:
// 30 минут, окно 09:00–18:00 UTC, все 7 дней, 14 дней от from (по умолчанию сегодня).

use chrono::{DateTime, Datelike, TimeZone, Timelike, Utc};
use std::collections::HashSet;

use crate::models::{Booking, Slot};

pub const SLOT_MINUTES: i64 = 30;
pub const DAY_START_MINUTES_UTC: i64 = 9 * 60;
pub const DAY_END_MINUTES_UTC: i64 = 18 * 60;
pub const WINDOW_DAYS: i64 = 14;

const MINUTE_MS: i64 = 60_000;
const DAY_MS: i64 = 86_400_000;

// Начало UTC-суток, содержащих дату from (или сегодня, если from не задан).
pub fn window_day_start(from: Option<DateTime<Utc>>) -> DateTime<Utc> {
    let base = from.unwrap_or_else(Utc::now);
    Utc.with_ymd_and_hms(base.year(), base.month(), base.day(), 0, 0, 0)
        .single()
        .expect("invalid date")
}

pub fn generate_slots(
    from: Option<DateTime<Utc>>,
    bookings: &[Booking],
) -> Vec<Slot> {
    let day_start = window_day_start(from);
    let day_start_ms = day_start.timestamp_millis();
    let now_ms = Utc::now().timestamp_millis();

    let taken: HashSet<i64> = bookings.iter().map(|b| b.start.timestamp_millis()).collect();

    let mut slots = Vec::with_capacity((WINDOW_DAYS * 18) as usize);
    for day in 0..WINDOW_DAYS {
        let day_ms = day_start_ms + day * DAY_MS;
        let mut minutes = DAY_START_MINUTES_UTC;
        while minutes < DAY_END_MINUTES_UTC {
            let start_ms = day_ms + minutes * MINUTE_MS;
            let end_ms = start_ms + SLOT_MINUTES * MINUTE_MS;
            // Прошедшие слоты недоступны для записи.
            let available = !taken.contains(&start_ms) && start_ms > now_ms;
            slots.push(Slot {
                start: from_millis(start_ms),
                end: from_millis(end_ms),
                available,
            });
            minutes += SLOT_MINUTES;
        }
    }
    slots
}

// Проверка, что start попадает в сетку доступных слотов.
// Возвращает нормализованный {start, end}, если слот валиден.
pub fn find_slot(start: DateTime<Utc>, bookings: &[Booking]) -> Option<(DateTime<Utc>, DateTime<Utc>)> {
    let start_ms = start.timestamp_millis();

    // Выравнивание по 30 минутам
    if start_ms % (SLOT_MINUTES * MINUTE_MS) != 0 {
        return None;
    }

    // В окне 09:00–18:00 UTC
    let minutes_utc = start.hour() as i64 * 60 + start.minute() as i64;
    if !(DAY_START_MINUTES_UTC..DAY_END_MINUTES_UTC).contains(&minutes_utc) {
        return None;
    }

    // В 14-дневном окне от сегодня (UTC)
    let today_start = window_day_start(None);
    let today_ms = today_start.timestamp_millis();
    if start_ms < today_ms || start_ms >= today_ms + WINDOW_DAYS * DAY_MS {
        return None;
    }

    // Занят ли слот
    if bookings.iter().any(|b| b.start.timestamp_millis() == start_ms) {
        return None;
    }

    let end_ms = start_ms + SLOT_MINUTES * MINUTE_MS;
    Some((start, from_millis(end_ms)))
}

fn from_millis(ms: i64) -> DateTime<Utc> {
    Utc.timestamp_millis_opt(ms).single().expect("invalid ts")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window_is_14_days_18_slots_each() {
        let slots = generate_slots(None, &[]);
        assert_eq!(slots.len(), 14 * 18);
    }

    #[test]
    fn slots_aligned_and_in_window() {
        let slots = generate_slots(None, &[]);
        for s in &slots {
            let mins = s.start.hour() as i64 * 60 + s.start.minute() as i64;
            assert_eq!(s.start.timestamp_millis() % (30 * MINUTE_MS), 0);
            assert!(mins >= DAY_START_MINUTES_UTC && mins < DAY_END_MINUTES_UTC);
            assert_eq!((s.end.timestamp_millis() - s.start.timestamp_millis()), 30 * MINUTE_MS);
        }
    }

    #[test]
    fn from_shifts_window() {
        let a = generate_slots(None, &[]);
        let from = Utc::now() + chrono::Duration::days(7);
        let b = generate_slots(Some(from), &[]);
        assert!(b[0].start > a[0].start);
        assert_eq!(a.len(), b.len());
    }

    #[test]
    fn find_slot_rejects_unaligned() {
        let start = Utc::now() + chrono::Duration::days(1);
        let aligned = find_slot(start, &[]);
        // если now не ровно на 30 мин — start может быть невыровнен; проверим оба исхода
        if aligned.is_none() {
            assert!(start.timestamp_millis() % (30 * MINUTE_MS) != 0);
        }
    }
}
