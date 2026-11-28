use axum::extract::FromRef;
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};

/// 服务端跨线程共享状态机
#[derive(Debug, Serialize, Deserialize, FromRef, Clone)]
pub struct SharedState {
    #[serde(skip)]
    pub db_conn: DatabaseConnection,
    #[from_ref(skip)]
    pub debug_msg: &'static str,
}

impl SharedState {
    pub(crate) fn new(db_conn: DatabaseConnection) -> Self {
        Self {
            db_conn,
            debug_msg: "Hello, Axum!",
        }
    }
}
