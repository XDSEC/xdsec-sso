//! 服务端主程序

use anyhow::Result;
use clap::Parser;
use cli::*;
use time::UtcOffset;
use tokio;
use tracing::{debug, error, info, trace, warn};
use tracing_subscriber;

mod cli;
mod utils;

fn init_tracing(log_control: &cli::LogControl) {
    let subscriber = tracing_subscriber::fmt()
        .with_timer(tracing_subscriber::fmt::time::LocalTime::rfc_3339())
        .with_file(true)
        .with_ansi(true)
        .with_line_number(true)
        .with_level(true)
        .with_max_level(log_control.log_level())
        .with_target(true)
        .finish();
    tracing::subscriber::set_global_default(subscriber).expect("无法应用日志配置！");
}

/// 程序入口点
fn main() {
    let cli = Cli::parse();
    init_tracing(&cli.log_control);
    error!("这是一条 ERROR 消息");
    warn!("这是一条 WARN 消息");
    info!("这是一条 INFO 消息");
    debug!("这是一条 DEBUG 消息");
    trace!("这是一条 TRACE 消息");

    debug!("命令行解析结果：{:?}", cli);
}
