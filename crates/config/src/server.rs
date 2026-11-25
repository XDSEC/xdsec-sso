//! 服务端配置

use std::time::Duration;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Hash)]
pub struct RateLimit {
    /// 应对突发请求可同时放行的最大数量
    pub burst_limit: u32,
    /// 每个连接放行后要冷却多久
    #[serde(with = "millis_format")]
    pub burst_recover_time: Duration,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq, Hash)]
pub struct RateLimitConfig {
    /// 快速 API 的限速
    #[serde(default)]
    query_limit: RateLimit,
    /// 耗时 API 的限速
    #[serde(default)]
    blocking_limit: RateLimit,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq, Hash)]
pub struct Config {
    /// 主机地址
    pub host: String,
    /// 端口
    pub port: u16,
    /// API 接口路径前缀
    pub api_base: String,
    /// 限速策略（采用 RCGA 算法）
    #[serde(default)]
    pub rate_limit: RateLimitConfig,
}

impl Default for RateLimit {
    /// 默认不限速（不建议）
    fn default() -> Self {
        RateLimit {
            burst_limit: u32::MAX,
            burst_recover_time: Duration::default(),
        }
    }
}

/// serde 实现：将 u64 转换为 Duration
mod millis_format {
    use std::time::Duration;

    use serde::{Deserialize, Deserializer, Serializer};

    pub fn serialize<S: Serializer>(d: &Duration, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_u64(d.as_millis() as u64)
    }

    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Duration, D::Error> {
        let dur = u64::deserialize(d)?;
        Ok(Duration::from_millis(dur))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 测试手动实现的反序列化正确性
    #[test]
    fn duration_de() {
        let raw = r#"
            burst_limit = 0xDEADBEEF
            burst_recover_time = 709
        "#;
        assert_eq!(
            RateLimit {
                burst_limit: 0xDEADBEEF,
                burst_recover_time: Duration::from_secs_f64(0.709)
            },
            toml::from_str(raw).unwrap()
        );
    }
}
