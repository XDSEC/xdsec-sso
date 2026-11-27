//! xdsec-sso-config
//!
//! 负责读取配置文件。
//!
//! 配置文件采用 [TOML](https://toml.io/cn/) 格式，字段参考 /deploy/config/config.example.toml
//!
//! 预设搜索顺序如下：
//!
//! 1. `./config/config.toml`
//! 2. `~/.config/xdsec-sso/config.toml`
//! 3. `/etc/xdsec-sso/config.toml`
//!
//! 将采用第一个匹配的文件。
//!
//! 考虑到性能，不计划实现热重载功能，修改配置后请重启后端。

use std::{fs, io::Read, path::Path};

use serde::{Deserialize, Serialize};
use shellexpand;
use thiserror::Error;

pub mod database;
pub mod server;

#[cfg(unix)]
pub const LOAD_PATH: [&str; 3] = [
    "./config/config.toml",
    "~/.config/xdsec-sso/config.toml",
    "/etc/xdsec-sso/config.toml",
];

/// Not implemented for windows currently
#[cfg(windows)]
pub const LOAD_PATH: [&str; 1] = [".\\config\\config.toml"];

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("IO 错误")]
    IO(#[from] std::io::Error),
    #[error("格式解析出错")]
    Parse(#[from] toml::de::Error),
    #[error("未在加载路径中找到配置文件")]
    NoneFound,
    #[error("不支持非 UTF-8 格式路径")]
    NonUTF8Path,
}

/// 总配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalConfig {
    pub database: database::Config,
    pub server: server::Config,
}

impl GlobalConfig {
    /// 从字符串加载配置
    pub fn from_str(data: &str) -> Result<Self, ConfigError> { Ok(toml::from_str(data)?) }

    /// 从路径加载配置
    pub fn from_file(path: impl AsRef<Path>) -> Result<Self, ConfigError> {
        let mut f = fs::OpenOptions::new()
            .read(true)
            .open(std::fs::canonicalize(
                shellexpand::tilde(&path.as_ref().to_str().ok_or(ConfigError::NonUTF8Path)?)
                    .as_ref(),
            )?)?;
        let mut buf = String::new();
        f.read_to_string(&mut buf)?;
        Self::from_str(&buf)
    }

    /// 从预设路径列表依次尝试加载
    pub fn load() -> Result<Self, ConfigError> {
        LOAD_PATH
            .iter()
            .find_map(|path| Self::from_file(path).ok())
            .ok_or(ConfigError::NoneFound)
    }
}

#[cfg(test)]
mod tests {
    use super::{GlobalConfig, database::DBType};

    /// 验证示例配置可以从字符串解析，并核对关键字段。
    #[test]
    fn parses_example_config() {
        let raw = include_str!("../../../deploy/config/config.example.toml");
        let config = GlobalConfig::from_str(raw).expect("示例配置应能解析");

        assert_eq!(config.database.dbtype, DBType::PostgreSQL);
        assert_eq!(config.database.host, "example.com");
        assert_eq!(config.database.port, 5432);
        assert_eq!(config.database.database, "testdb");
        assert_eq!(config.server.host, "account.example.com");
        assert_eq!(config.server.port, 80);
        assert_eq!(config.server.api_base, "/api");
    }
}
