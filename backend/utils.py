from dotenv import load_dotenv
import os
from .config import config

# 从本地的配置文件加载配置到对象的变量
def load_env() -> None:
    load_dotenv(config.env_file_path)
    config.jwt_secret = os.getenv("JWTSecret", "default-jwt-secret")
    config.totp_secret = os.getenv("TotpSecret", "default-totp-secret")

# 配置日志对象
import logging
logging.basicConfig(
    level=logging.DEBUG if config.debug == True else logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)