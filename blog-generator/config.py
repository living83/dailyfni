import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR.parent / ".env")

class Settings:
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
    GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
    MASTER_KEY = os.getenv("MASTER_KEY", "CHANGEME_PLEASE_USE_32_CHARACTERS!")

    TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

    NAVER_CLIENT_ID = os.getenv("NAVER_CLIENT_ID", "")
    NAVER_CLIENT_SECRET = os.getenv("NAVER_CLIENT_SECRET", "")

    DATA_DIR = BASE_DIR / "data"
    COOKIES_DIR = DATA_DIR / "cookies"
    IMAGES_DIR = DATA_DIR / "images"
    DEBUG_DIR = DATA_DIR / "debug_screenshots"

    HEADLESS = os.getenv("HEADLESS", "true").strip().lower() != "false"

    PROXY_SERVER = os.getenv("PROXY_SERVER", "").strip()
    PROXY_USERNAME = os.getenv("PROXY_USERNAME", "").strip()
    PROXY_PASSWORD = os.getenv("PROXY_PASSWORD", "").strip()

settings = Settings()

# Ensure directories exist
for d in [settings.DATA_DIR, settings.COOKIES_DIR, settings.IMAGES_DIR, settings.DEBUG_DIR]:
    d.mkdir(parents=True, exist_ok=True)
