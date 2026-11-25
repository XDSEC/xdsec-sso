//! 命令行参数解析

use std::path::PathBuf;

use clap::{Args, Parser};
use tracing::level_filters::LevelFilter;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
pub struct Cli {
    /// 日志配置
    #[command(flatten)]
    pub log_control: LogControl,
    /// 手动指定配置文件路径
    #[arg(long)]
    pub config: Option<PathBuf>,
}

/// 日志配置
#[derive(Args, Debug)]
#[group(multiple = false, required = false)]
pub struct LogControl {
    /// 启用更详细的日志输出，可叠加一次
    #[arg(short, long, action = clap::ArgAction::Count, value_parser = clap::value_parser!(u8).range(0..=2))]
    verbose: u8,
    /// 只输出 WARN 和 ERROR 等级的日志
    #[arg(short, long)]
    quiet: bool,
}

impl LogControl {
    /// 由参数计算日志等级数值
    /// 由 0-5 分别为 OFF ERROR WARN INFO DEBUG TRACE
    pub fn log_level_number(&self) -> u8 { (self.verbose + 1) * !self.quiet as u8 + 2 }

    /// 由参数计算日志等级
    pub fn log_level(&self) -> LevelFilter {
        match self.log_level_number() {
            0 => LevelFilter::OFF,
            1 => LevelFilter::ERROR,
            2 => LevelFilter::WARN,
            3 => LevelFilter::INFO,
            4 => LevelFilter::DEBUG,
            5 => LevelFilter::TRACE,
            _ => panic!("你做了什么qwq 这条分支本不该到达......"),
        }
    }
}
