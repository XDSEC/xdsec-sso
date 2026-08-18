from sqlalchemy import Column, Integer, String, DateTime, VARCHAR, CHAR, Boolean, Text
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime, timezone

ModelBase = declarative_base()


class User(ModelBase):

    __tablename__ = "users"

    uuid = Column(CHAR(length=36), primary_key=True, nullable=False, comment="用户统一编号（uuid4）")
    username = Column(String(length=32), unique=True, index=True, nullable=False, comment="用户名，限定 ascii")
    email = Column(VARCHAR(length=128), unique=True, index=True, nullable=False, comment="邮箱地址")
    id = Column(String(length=64), nullable=True, comment="用户 id，可以为中文、空格，可留空")
    password = Column(VARCHAR(length=128), nullable=True, comment="bcrypt 后的密码，管理员导入的用户无密码，待重置")
    avatarUrl = Column(Text, nullable=True, comment="用户头像链接")
    isTotpActivated = Column(Boolean, default=False, nullable=False, comment="是否启用 TOTP MFA")
    totpSecret = Column(String(length=128), nullable=True, comment="TOTP 密钥")
    isPasskeyActivated = Column(Boolean, default=False, nullable=False, comment="是否启用 Passkey 登录")
    passkeySecret = Column(Text, nullable=True, comment="Passkey 公钥")
    isBanned = Column(Boolean, default=False, nullable=False, comment="是否被管理员封禁")
    banReason = Column(String(length=256), nullable=True, comment="封禁原因，解封时清空")
    isAdmin = Column(Boolean, default=False, nullable=False, comment="是否为管理员")

    def __repr__(self):
        return f"<User(username={self.username!r}, email={self.email!r})>"


class RecoveryCode(ModelBase):

    __tablename__ = "recovery_codes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(VARCHAR(length=128), index=True, nullable=False, comment="邮箱")
    generatedTime = Column(DateTime, default=datetime.now(timezone.utc), nullable=False, comment="生成时间")
    code = Column(String(length=128), nullable=False, comment="验证码 / 找回链接 token")


class EmailCode(ModelBase):

    __tablename__ = "email_codes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(VARCHAR(length=128), index=True, nullable=False, comment="邮箱")
    code = Column(Integer, nullable=False, comment="验证码")
    generatedTime = Column(DateTime, default=datetime.now(timezone.utc), nullable=False, comment="生成时间")


class Log(ModelBase):

    __tablename__ = "logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    operator = Column(VARCHAR(length=32), index=True, nullable=False, comment="操作者的 username")
    action = Column(Text, nullable=False, comment="操作内容")
    operationTime = Column(DateTime, default=datetime.now(timezone.utc), nullable=False, comment="操作时间")
    receiver = Column(VARCHAR(length=32), index=True, nullable=True, comment="操作对象的 username（如有）")
