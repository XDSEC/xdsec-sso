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
mod middleware;
mod server;
mod state;
mod utils;

pub use state::{SharedState, StateType};
pub use utils::rate_limit::RateLimit;

/// 程序入口点
fn main() -> ! {
    let cli = Cli::parse();
    init_tracing(&cli.log_control).expect("cannot apply logging configurations");

    trace!("Command-line parse result: {:?}", cli);

    let config = sso_config::GlobalConfig::load().expect("failed to load config");

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .expect("failed to create asynchronous runtime");

    match runtime.block_on(server::launch(&config)) {
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
