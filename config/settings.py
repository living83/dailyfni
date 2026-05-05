import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_DIR = Path(__file__).resolve().parent

# 루트 .env 우선 → 없으면 config/.env 사용
_root_env = BASE_DIR / ".env"
_config_env = CONFIG_DIR / ".env"
load_dotenv(_root_env if _root_env.exists() else _config_env)


class Settings:
    # Security & Third-party keys
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
    MASTER_KEY = os.getenv("MASTER_KEY", "CHANGEME_PLEASE_USE_32_CHARACTERS!") # Must be 32+ chars for AES256
    
    # Telegram
    TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

    # Data paths
    DATA_DIR = BASE_DIR / "data"
    COOKIES_DIR = DATA_DIR / "cookies"
    IMAGES_DIR = DATA_DIR / "images"

    # Database connection
    MYSQL_HOST = os.getenv("MYSQL_HOST", "127.0.0.1")
    MYSQL_PORT = int(os.getenv("MYSQL_PORT", 3306))
    MYSQL_USER = os.getenv("MYSQL_USER", "root")
    MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
    MYSQL_DB = os.getenv("MYSQL_DATABASE", "naver_blog_auto")

    # App Settings
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

    # Browser Settings
    # HEADLESS=false 로 설정하면 브라우저 창을 화면에 표시 (디버깅용)
    HEADLESS: bool = os.getenv("HEADLESS", "true").strip().lower() != "false"

    # Proxy Settings (선택사항 — 비워두면 직접 연결)
    # DB accounts 테이블에 proxy_server가 없는 계정에 공통으로 적용되는 글로벌 프록시
    # 계정별 개별 프록시는 프론트엔드 Accounts 페이지에서 설정
    PROXY_SERVER: str = os.getenv("PROXY_SERVER", "").strip()      # 예: http://host:port
    PROXY_USERNAME: str = os.getenv("PROXY_USERNAME", "").strip()
    PROXY_PASSWORD: str = os.getenv("PROXY_PASSWORD", "").strip()

settings = Settings()
