from flask import Blueprint, jsonify, request
from ..utils import logging

auth_bp = Blueprint("auth", __name__)

@auth_bp.post("/login")
def login():
    # 不在这里处理totp的逻辑，totp的情况按数据库返回
    # 先获取用户提交的信息
    try:
        data = request.get_json()
        if data is None:
            logging.warning("/auth/login 请求体不是合法的JSON格式，Content-Type: %s", request.content_type)
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
    if not data or not all([username, email, password]):
        resp = {
            "isSuccess": False,
            "code": "parameter.Invalid",
            "reason": "请求缺失了必要参数，如果你是前端，请检查是否以约定的json形式发送数据"
        }
        return jsonify(resp), 400
    if not all([username.isascii(), password.isascii(), email.isascii()]):
        resp = {
            "isSuccess": False,
            "code": "parameter.BeyondAscii",
            "reason": "参数包含Ascii码表以外的字符"
        }
        return jsonify(resp), 400

    # 在数据库中查询是否存在该用户

    # 生成jwt并返回

    return "ok"