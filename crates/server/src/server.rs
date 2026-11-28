//! 服务端业务代码

use anyhow::Result;
use sso_database::connect_database;
use tower_http::trace::{self, TraceLayer};
use tracing::{self, Level, event, instrument};

use crate::SharedState;
use crate::api;

#[instrument(skip_all)]
pub async fn launch(config: &sso_config::GlobalConfig) -> Result<()> {
    let db_conn = connect_database(&config.database).await?;

    let state = SharedState::new(db_conn);
    let trace_layer =
        TraceLayer::new_for_http().make_span_with(trace::DefaultMakeSpan::new().level(Level::INFO));

    let router = axum::Router::new().nest("/v1", api::v1());

    // 高风险调试路由，仅于 debug 配置下启用
    #[cfg(debug_assertions)]
    let router = router.nest("/debug", api::debug());

    let router = router.with_state(state).route_layer(trace_layer);
    let listener =
        tokio::net::TcpListener::bind((config.server.host.clone(), config.server.port)).await?;
    event!(
        Level::INFO,
        "开始监听地址 {}:{}",
        config.server.host,
        config.server.port
    );
    axum::serve(listener, router).await?;
    Ok(())
}
