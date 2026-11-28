//! 服务端业务代码

use anyhow::Result;
use axum::{
    Json,
    body::Body,
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use serde_json::json;
use sso_database::connect_database;
use tower_http::trace::{self, DefaultOnRequest, TraceLayer};
use tower_http::trace::{DefaultOnFailure};
use tracing::{self, Level, event, instrument};

use crate::SharedState;
use crate::api;

#[instrument(skip_all)]
pub async fn launch(config: &sso_config::GlobalConfig) -> Result<()> {
    let db_conn = connect_database(&config.database).await?;
    let state = SharedState::new(db_conn);
    let trace_layer = TraceLayer::new_for_http()
        .make_span_with(trace::DefaultMakeSpan::new().level(Level::INFO))
        .on_request(DefaultOnRequest::new().level(Level::INFO))
        .on_failure(DefaultOnFailure::new().level(Level::ERROR));
    let rate_limit_layer = crate::middleware::RateLimitLayer::new(
        config.server.rate_limit.query_limit.clone(),
        rate_limit_response,
    );

    let router = axum::Router::new().nest("/v1", api::v1());

    // 高风险调试路由，仅于 debug 配置下启用
    #[cfg(debug_assertions)]
    let router = router.nest("/debug", api::debug());

    let router = router
        .with_state(state)
        .route_layer(trace_layer)
        .route_layer(rate_limit_layer);
    let listener =
        tokio::net::TcpListener::bind((config.server.host.clone(), config.server.port)).await?;
    event!(
        Level::INFO,
        "start listening on {}:{}",
        config.server.host,
        config.server.port
    );
    axum::serve(listener, router).await?;
    Ok(())
}

async fn rate_limit_response(retry_after: std::time::Duration) -> Response<Body> {
    event!(Level::WARN, "rate limit reached, returning 429");
    (
        StatusCode::TOO_MANY_REQUESTS,
        [
            (
                header::RETRY_AFTER,
                HeaderValue::from(retry_after.as_secs().saturating_add((retry_after.subsec_nanos() > 0) as u64)),
            ),
            (
                header::CONTENT_TYPE,
                HeaderValue::from_static("application/problem+json"),
            ),
        ],
        Json(json!(
            {
                "title": "Too Many Requests",
                "status": 429,
                "code": "rate_limited",
                "detail": "请求太频繁，请稍后再试"
            }
        )),
    )
        .into_response()
}
