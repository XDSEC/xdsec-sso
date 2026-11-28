//! 服务端主程序

use std::process::exit;

use clap::Parser;
use cli::*;
use logger::*;
use tokio;
use tracing::*;

mod api;
mod cli;
mod logger;
mod server;
mod utils;

/// 程序入口点
fn main() -> ! {
    let cli = Cli::parse();
    init_tracing(&cli.log_control).expect("无法应用日志配置！");
    let span_logtest = span!(Level::DEBUG, "日志测试");
    #[cfg(debug_assertions)]
    {
        let _enter = span_logtest.enter();
        error!("这是一条 ERROR 消息");
        warn!("这是一条 WARN 消息");
        info!("这是一条 INFO 消息");
        debug!("这是一条 DEBUG 消息");
        trace!("这是一条 TRACE 消息");
        drop(_enter);
    }
    trace!("命令行解析结果：{:?}", cli);

    let config = sso_config::GlobalConfig::load().expect("无法加载配置文件！");

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("无法创建异步运行时！");

    match runtime.block_on(server::launch(&config.server)) {
        Ok(()) => exit(0),
        Err(e) => {
            error!("{}", e);
            let mut err = e.source();
            while let Some(e) = err {
                error!("{}", e);
                err = e.source();
            }
            exit(1);
        },
    }
}
