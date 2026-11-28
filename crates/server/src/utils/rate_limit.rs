//! API 限速算法实现
//! 采用 **通用信元速率算法**

use std::time::{Duration, Instant};

use sso_config::server::RateLimit as RateLimitConf;

/// 用于提供限速算法实现的类型
#[derive(Clone, Copy)]
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

    /// 至少要等待多久才能进行下一次连接
    pub fn next(&mut self) -> Duration {
        let now = Instant::now();
        if now + self.tolerance < self.tat {
            self.tat - now - self.tolerance
        } else {
            self.tat = now.max(self.tat) + self.recover_time;
            Duration::ZERO
        }
    }

    /// 当前是否可处理下一次连接
    pub fn ready(&mut self) -> bool {
        self.next() == Duration::ZERO
    }
}

#[cfg(test)]
mod tests {
    use super::{Duration, Instant, RateLimit, RateLimitConf};

    /// 验证突发额度耗尽后，每个冷却周期恢复一个连接额度
    #[test]
    fn burst_capacity_recovers_one_connection_at_a_time() {
        let recover_time = Duration::from_secs(60);
        let mut limit = RateLimit::from_config(RateLimitConf {
            burst_limit: 3,
            burst_recover_time: recover_time,
        });

        assert_eq!(limit.tolerance, recover_time * 2);
        for _ in 0..3 {
            assert!(limit.ready());
        }

        let full_tat = limit.tat;
        assert!(!limit.ready());
        assert_eq!(limit.tat, full_tat);

        limit.tat -= recover_time;
        assert!(limit.ready());
        assert_eq!(limit.tat, full_tat);
        assert!(!limit.ready());
    }

    /// 验证空闲后的首个连接从当前时刻重新计时
    #[test]
    fn first_connection_after_idle_restarts_schedule() {
        let recover_time = Duration::from_secs(60);
        let mut limit = RateLimit::from_config(RateLimitConf {
            burst_limit: 1,
            burst_recover_time: recover_time,
        });

        limit.tat = Instant::now() - Duration::from_secs(1);
        let before = Instant::now();
        assert!(limit.ready());
        let after = Instant::now();

        assert!(limit.tat >= before + recover_time);
        assert!(limit.tat <= after + recover_time);
        assert!(!limit.ready());
    }
}
