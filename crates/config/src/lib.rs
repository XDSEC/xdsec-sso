//! xdsec-sso-config
//! 
//! 负责读取配置文件。
//! 
//! 配置文件采用 [TOML](https://toml.io/cn/) 格式，搜索顺序如下：
//! 
//! 1. `./config/config.toml`
//! 2. `~/.config/xdsec-sso/config.toml`
//! 3. `/etc/xdsec-sso/config.toml`
//! 
//! 将采用第一个匹配的文件。
//! 
//! 考虑到性能，不计划实现热重载功能，修改配置后请重启后端。

use serde::{Deserialize, Serialize};

pub mod server;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalConfig {

}