use std::collections::HashMap;

use axum::routing::{get, post};
use axum::{Router, body::Bytes, extract::*};
use serde_json::{Map, Value};

use crate::StateType;

async fn post_echo(data: Bytes) -> Bytes { data }

async fn get_echo(Query(query): Query<HashMap<String, String>>) -> Json<Value> {
    Json(Value::Object(Map::from_iter(
        query.into_iter().map(|(k, v)| (k, Value::String(v))),
    )))
}

async fn get_state(State(state): State<StateType>) -> Json<Value> {
    Json(serde_json::to_value(state).unwrap())
}

pub fn router() -> Router<StateType> {
    Router::new()
        .route("/state", get(get_state))
        .route("/echo", post(post_echo).get(get_echo))
}
