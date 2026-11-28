//! API 与 路由

mod debug;
mod v1;

pub use debug::router as debug;
pub use v1::router as v1;
