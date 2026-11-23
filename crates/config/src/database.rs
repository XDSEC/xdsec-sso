//! 数据库配置

use serde::{Deserialize, Serialize};
use urlencoding;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Hash)]
pub struct Config {
    /// 数据库类型
    pub protocol: DBType,
    /// 主机
    pub host: String,
    /// 端口
    #[serde(default = "default_port")]
    pub port: u16,
    /// 用户名
    pub user: String,
    /// 密码
    pub passwd: String,
    /// 数据库
    pub database: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum DBType {
    #[serde(alias = "mariadb")]
    MySQL,
    #[serde(alias = "postgres")]
    PostgreSQL,
    SQLite,
}

impl std::fmt::Display for DBType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::MySQL => "mysql",
            Self::PostgreSQL => "postgres",
            Self::SQLite => "sqlite",
        })
    }
}

impl Config {
    pub fn dsn(&self) -> String {
        use urlencoding::encode;
        let user = encode(&self.user);
        let passwd = encode(&self.passwd);
        format!(
            "{}://{}:{}@{}:{}/{}",
            self.protocol, user, passwd, self.host, self.port, self.database
        )
    }
}

fn default_port() -> u16 { 3306 }
