use std::time::{Duration, Instant};

use sso_config::server::RateLimit as RateLimitConf;

pub struct RateLimit {
    tat: Instant,
    pub tolerance: Duration,
    pub recover_time: Duration,
}

impl RateLimit {
    pub fn from_config(conf: RateLimitConf) -> Self {
        Self {
            recover_time: conf.burst_recover_time,
            tolerance: conf.burst_recover_time * (conf.burst_limit - 1),
            tat: Instant::now(),
        }
    }

    pub fn ready(&mut self) -> bool {
        let now = Instant::now();
        if now + self.tolerance < self.tat {
            false
        } else {
            self.tat = now.max(self.tat) + self.tolerance;
            true
        }
    }
}
