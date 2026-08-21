from flask import Flask, Blueprint
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///example.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# 数据模型

from datetime import datetime, timezone

class User(db.Model):

    __tablename__ = "users"

    uuid = db.Column(db.CHAR(length=36), primary_key=True, nullable=False, comment="用户统一编号（uuid4）")
    username = db.Column(db.String(length=32), unique=True, index=True, nullable=False, comment="用户名，限定 ascii")
    email = db.Column(db.VARCHAR(length=128), unique=True, index=True, nullable=False, comment="邮箱地址")
    id = db.Column(db.String(length=64), nullable=True, comment="用户 id，可以为中文、空格，可留空")
    password = db.Column(db.VARCHAR(length=128), nullable=True, comment="bcrypt 后的密码，管理员导入的用户无密码，待重置")
    avatarUrl = db.Column(db.Text, nullable=True, comment="用户头像链接")
    isTotpActivated = db.Column(db.Boolean, default=False, nullable=False, comment="是否启用 TOTP MFA")
    totpSecret = db.Column(db.String(length=128), nullable=True, comment="TOTP 密钥")
    isPasskeyActivated = db.Column(db.Boolean, default=False, nullable=False, comment="是否启用 Passkey 登录")
    passkeySecret = db.Column(db.Text, nullable=True, comment="Passkey 公钥")
    isBanned = db.Column(db.Boolean, default=False, nullable=False, comment="是否被管理员封禁")
    banReason = db.Column(db.String(length=256), nullable=True, comment="封禁原因，解封时清空")
    isAdmin = db.Column(db.Boolean, default=False, nullable=False, comment="是否为管理员")

    def __repr__(self):
        return f"<User(username={self.username!r}, email={self.email!r})>"


class RecoveryCode(db.Model):

    __tablename__ = "recovery_codes"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    email = db.Column(db.VARCHAR(length=128), index=True, nullable=False, comment="邮箱")
    generatedTime = db.Column(db.DateTime, default=datetime.now(timezone.utc), nullable=False, comment="生成时间")
    code = db.Column(db.String(length=128), nullable=False, comment="验证码 / 找回链接 token")


class EmailCode(db.Model):

    __tablename__ = "email_codes"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    email = db.Column(db.VARCHAR(length=128), index=True, nullable=False, comment="邮箱")
    code = db.Column(db.Integer, nullable=False, comment="验证码")
    generatedTime = db.Column(db.DateTime, default=datetime.now(timezone.utc), nullable=False, comment="生成时间")


class Log(db.Model):

    __tablename__ = "logs"

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    operator = db.Column(db.VARCHAR(length=32), index=True, nullable=False, comment="操作者的 username")
    action = db.Column(db.Text, nullable=False, comment="操作内容")
    operationTime = db.Column(db.DateTime, default=datetime.now(timezone.utc), nullable=False, comment="操作时间")
    receiver = db.Column(db.VARCHAR(length=32), index=True, nullable=True, comment="操作对象的 username（如有）")

with app.app_context():
    db.create_all()

from .routes.auth import auth_bp
app.register_blueprint(auth_bp, url_prefix="/auth")


if __name__ == "__main__":
    app.run(debug=True, load_dotenv=True)
