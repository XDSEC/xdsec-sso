//! 日志记录模块

use anyhow::Result;
use time::macros::format_description;
use tracing::subscriber::set_global_default;
use tracing_subscriber::{
    Layer,
    fmt::{self},
    layer::SubscriberExt,
    registry,
};

use crate::cli::LogControl;

pub fn init_tracing(log_control: &LogControl) -> Result<()> {
    let time_format = format_description!(
        "[year]-[month]-[day]T[hour]:[minute]:[second].[subsecond digits:7]+[offset_hour]:[offset_minute]"
    );

    let console_layer = fmt::layer()
        .with_timer(tracing_subscriber::fmt::time::LocalTime::new(time_format))
        .with_ansi(true)
        .with_level(true)
        .with_target(true)
        // Debug options
        .with_file(cfg!(debug_assertions))
        .with_line_number(cfg!(debug_assertions));

    let subscriber = registry().with(console_layer.with_filter(log_control.log_level()));

    set_global_default(subscriber)?;

    Ok(())
}
