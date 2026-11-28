//! 数据库操作

use sea_orm::{Database, DatabaseConnection, DbErr};
use sso_config::database::Config;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum DatabaseError {
    #[error("数据库错误")]
    Database(#[from] DbErr),
}

pub async fn connect_database(cfg: &Config) -> Result<DatabaseConnection, DatabaseError> {
    Ok(Database::connect(cfg.dsn()).await?)
}
