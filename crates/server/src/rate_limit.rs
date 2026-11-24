//! API 限速算法实现
//! 采用 **通用信元速率算法**

use std::time::{Duration, Instant};

use sso_config::server::RateLimit as RateLimitConf;

/// 用于提供限速算法实现的类型
pub struct RateLimit {
    tat: Instant,
    pub tolerance: Duration,
    pub recover_time: Duration,
}

impl RateLimit {
    /// 从 config 构造
    pub fn from_config(conf: RateLimitConf) -> Self {
        Self {
            recover_time: conf.burst_recover_time,
            tolerance: conf.burst_recover_time * (conf.burst_limit - 1),
            tat: Instant::now(),
        }
    }

    /// 当前时刻是否应当处理连接
    pub fn ready(&mut self) -> bool {
        let now = Instant::now();
        if now + self.tolerance < self.tat {
            false
        } else {
            self.tat = now.max(self.tat) + self.recover_time;
            true
        }
    }
}
