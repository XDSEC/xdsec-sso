use std::sync::Arc;

use axum::{Router, routing::get};

use crate::server::SharedState;

pub fn router() -> Router<Arc<SharedState>> { Router::new().route("/status", get(get_status)) }

async fn get_status() -> &'static str { "alive" }
