from flask import Flask
from .models import User
from .extensions import db

app = Flask(__name__)

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///example.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)
with app.app_context():
    db.create_all()

from .routes.auth import auth_bp
app.register_blueprint(auth_bp, url_prefix="/auth")


if __name__ == "__main__":
    app.run(debug=True, load_dotenv=True)
