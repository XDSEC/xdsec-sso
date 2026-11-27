//! 服务端业务代码

use std::sync::Arc;

use anyhow::Result;
use axum::routing::{get, post};
use axum::{Json, Router, body::Bytes, extract::State};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// 服务端跨线程共享状态机
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct SharedState {
    debug_hello: &'static str,
}

impl SharedState {
    fn new() -> Self {
        Self {
            debug_hello: "Hello, Rust!",
        }
    }
}

async fn echo(data: Bytes) -> Bytes { data }

async fn get_state(State(state): State<Arc<SharedState>>) -> Json<Value> {
    Json(serde_json::to_value(state.as_ref()).unwrap())
}

pub async fn launch(config: &sso_config::server::Config) -> Result<()> {
    let state = Arc::new(SharedState::new());
    let router = Router::new();

    // 高风险调试路由，仅于 debug 配置下启用
    #[cfg(debug_assertions)]
    let router = router.nest("/debug", {
        Router::new()
            .route("/echo", post(echo))
            .route("/state", get(get_state))
    });

    let router = router.with_state(state);
    let listener = tokio::net::TcpListener::bind((config.host.clone(), config.port)).await?;
    axum::serve(listener, router).await?;
    Ok(())
}
