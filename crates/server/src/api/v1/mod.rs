use axum::{Router, routing::get};

use crate::StateType;

pub fn router() -> Router<StateType> { Router::new().route("/status", get(get_status)) }

async fn get_status() -> &'static str { "alive" }
