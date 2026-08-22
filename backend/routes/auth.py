from flask import Blueprint, jsonify, request
from ..utils import logging
from ..extensions import db
from ..models import User

auth_bp = Blueprint("auth", __name__)

@auth_bp.post("/login")
def login():
    # 不在这里处理totp的逻辑，totp的情况按数据库返回
    # 先获取用户提交的信息
    try:
        data = request.get_json()
        if data is None:
            logging.warning("/auth/login 请求体不是合法的JSON格式，Content-Type: %s\nData Body：%s", request.content_type, request.data)
            return jsonify({
                "isSuccess": False,
                "code": "parameter.Invalid",
                "reason": "请求体必须是合法的JSON格式"
            }), 400
        username = data.get("username", "")
        email = data.get("email", "")
        password = data.get("password", "")
    except Exception as e:
        logging.warning("/auth/login 解析参数异常：%s", str(e))
        return jsonify({
            "isSuccess": False,
            "code": "parameter.Invalid",
            "reason": "解析提交的参数出现问题，如果你是前端，请检查是否以约定的json形式发送数据"
        }), 400

    # 在数据库中查询是否存在该用户
    if username and password:
        database_user = User.query.filter_by(username=username).first()
        if database_user and not database_user.verify_password(password):
            database_user = None
    elif email and password:
        database_user = User.query.filter_by(email=email).first()
        if database_user and not database_user.verify_password(password):
            database_user = None
    else:
        logging.warning("/auth/login 参数出现缺失，data：%s", request.data)

    if not database_user:
        return jsonify({
            "isSuccess": False,
            "code": "parameter.Wrong",
            "reason": "用户名、邮箱或密码错误"
        }), 400
    if database_user.isBanned:
        logging.warning("被禁止登录的用户正在尝试登录系统，username：%s", database_user.username)
        return jsonify({
            "isSuccess": False,
            "code": "auth.banned",
            "reason": "管理员禁止你登录本系统"
        }, 403)
    from time import time
    jwt = {
        "username": database_user.username,
        "id": database_user.id,
        "uuid": database_user.uuid,
        "email": database_user.email,
        "issueTime": time(),
        "isTotpActivated": database_user.isTotpActivated,
        "isTotpAuthenticated": False,
        "isPasskeyActivated": database_user.isPasskeyActivated,
        "isAdmin": database_user.isAdmin
    }
    return jsonify({
        "isSuccess": True,
        "token": jwt
    })