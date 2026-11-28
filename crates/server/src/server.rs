//! 服务端业务代码

use std::sync::Arc;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use tower_http::trace::{self, TraceLayer};
use tracing::{self, Level, event, instrument};

use crate::api;

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

#[instrument(skip_all)]
pub async fn launch(config: &sso_config::server::Config) -> Result<()> {
    let state = Arc::new(SharedState::new());
    let trace_layer =
        TraceLayer::new_for_http().make_span_with(trace::DefaultMakeSpan::new().level(Level::INFO));

    let router = axum::Router::new().nest("/v1", api::v1());

    // 高风险调试路由，仅于 debug 配置下启用
    #[cfg(debug_assertions)]
    let router = router.nest("/debug", api::debug());

    let router = router.with_state(state).route_layer(trace_layer);
    let listener = tokio::net::TcpListener::bind((config.host.clone(), config.port)).await?;
    event!(Level::INFO, "开始监听地址 {}:{}", config.host, config.port);
    axum::serve(listener, router).await?;
    Ok(())
}
