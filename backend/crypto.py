"""
crypto.py - 비밀번호 암호화/복호화
AES-256-GCM 기반 대칭키 암호화
"""

import os
import base64
import hashlib
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

KEY_FILE = Path(__file__).resolve().parent.parent / "data" / ".master_key"


def _get_or_create_key() -> bytes:
    """마스터 키 파일이 없으면 새로 생성, 있으면 읽기"""
    KEY_FILE.parent.mkdir(parents=True, exist_ok=True)
    if KEY_FILE.exists():
        return base64.b64decode(KEY_FILE.read_text().strip())
    key = AESGCM.generate_key(bit_length=256)
    KEY_FILE.write_text(base64.b64encode(key).decode())
    KEY_FILE.chmod(0o600)
    return key


def encrypt_password(plain_text: str) -> str:
    """평문 비밀번호를 암호화하여 base64 문자열로 반환"""
    key = _get_or_create_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    encrypted = aesgcm.encrypt(nonce, plain_text.encode("utf-8"), None)
    # nonce(12) + ciphertext 를 base64로
    return base64.b64encode(nonce + encrypted).decode()


def decrypt_password(enc_text: str) -> str:
    """암호화된 base64 문자열을 복호화하여 평문 반환"""
    key = _get_or_create_key()
    aesgcm = AESGCM(key)
    raw = base64.b64decode(enc_text)
    nonce = raw[:12]
    ciphertext = raw[12:]
    return aesgcm.decrypt(nonce, ciphertext, None).decode("utf-8")
