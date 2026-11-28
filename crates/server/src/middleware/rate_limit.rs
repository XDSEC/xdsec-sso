//! 中间件：接口限速

use std::{time::Duration, sync::{Arc, Mutex}};

use sso_config::server::RateLimit as Config;
use tower::{Layer, Service};
use futures_util::future::{Either, FutureExt};

use crate::RateLimit;

#[derive(Clone)]
pub struct RateLimitService<F, S> {
    on_limit: F,
    state: Arc<Mutex<RateLimit>>, // 共享可更新的限速状态
    inner: S,
}

impl<F, S, R, Fut> Service<R> for RateLimitService<F, S>
where
    S: Service<R>,
    F: Fn(Duration) -> Fut,
    Fut: Future<Output = S::Response>,
{
    type Error = S::Error;
    type Response = S::Response;
    // 通过 Either 处理两种 Future 返回结果
    type Future = Either<S::Future, futures_util::future::Map<Fut, fn(S::Response) -> Result<S::Response, S::Error>>>;

    fn poll_ready(&mut self, cx: &mut std::task::Context<'_>) -> std::task::Poll<Result<(), Self::Error>> {
        self.inner.poll_ready(cx)
    }

    fn call(&mut self, req: R) -> Self::Future {
        let mut guard = self.state.lock().unwrap();
        match guard.next() {
            Duration::ZERO => Either::Left(self.inner.call(req)),
            cooldown => Either::Right((self.on_limit)(cooldown).map(|x| Ok(x))),
        }
    }
}

#[derive(Clone)]
pub struct RateLimitLayer<F> {
    on_limit: F,
    limit: Arc<Mutex<RateLimit>>,
}

impl<F> RateLimitLayer<F> {
    pub fn new(config: Config, on_limit: F) -> Self {
        Self {
            on_limit,
            limit: Arc::new(Mutex::new(RateLimit::from_config(config)))
        }
    }
}

impl<F: Clone, S> Layer<S> for RateLimitLayer<F> {
    type Service = RateLimitService<F, S>;

    fn layer(&self, inner: S) -> Self::Service {
        Self::Service {
            on_limit: self.on_limit.clone(),
            state: self.limit.clone(),
            inner,
        }
    }
}
