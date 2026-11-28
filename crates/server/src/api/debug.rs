use std::sync::Arc;

use axum::routing::{get, post};
use axum::{Router, body::Bytes, extract::*};
use serde_json::Value;

use crate::server::SharedState;

async fn post_echo(data: Bytes) -> Bytes { data }

async fn get_state(State(state): State<Arc<SharedState>>) -> Json<Value> {
    Json(serde_json::to_value(state.as_ref()).unwrap())
}

pub fn router() -> Router<Arc<SharedState>> {
    Router::new()
        .route("/state", get(get_state))
        .route("/echo", post(post_echo))
}
