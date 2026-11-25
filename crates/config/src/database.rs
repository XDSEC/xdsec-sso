//! 数据库配置

use serde::{Deserialize, Serialize};
use urlencoding;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Hash)]
pub struct Config {
    /// 数据库类型
    pub dbtype: DBType,
    /// 主机
    pub host: String,
    /// 端口
    #[serde(default = "default_port")]
    pub port: u16,
    /// 用户名
    pub user: String,
    /// 密码
    pub password: String,
    /// 数据库
    pub database: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum DBType {
    #[serde(alias = "mariadb")]
    MySQL,
    #[serde(alias = "postgres", alias = "psql")]
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
    /// 用各字段的值构造 DSN 连接字符串
    /// `user` 和 `password` 会先进行 URL 编码
    pub fn dsn(&self) -> String {
        use urlencoding::encode;
        let user = encode(&self.user);
        let passwd = encode(&self.password);
        format!(
            "{}://{}:{}@{}:{}/{}",
            self.dbtype, user, passwd, self.host, self.port, self.database
        )
    }
}

fn default_port() -> u16 { 3306 }

#[cfg(test)]
mod tests {
    use super::*;

    /// 测试 Config::dsn
    #[test]
    fn dsn() {
        let raw_config = r#"
            dbtype = "postgres"
            host = "localhost"
            port = 5432
            user = "dsn_test@xdsec-sso"
            password = "sed -i s/test/测试/g dummy.txt"
            database = "test"
        "#;
        const CORRECT_RESULT: &str = "postgres://dsn_test%40xdsec-sso:sed%20-i%20s%2Ftest%2F%E6%B5%8B%E8%AF%95%2Fg%20dummy.txt@localhost:5432/test";
        let conf: Config = toml::from_str(raw_config).unwrap();
        assert_eq!(conf.dsn(), CORRECT_RESULT);
    }
}
