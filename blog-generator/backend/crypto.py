"""
AES-256-GCM 암호화/복호화 유틸리티
마스터 키는 환경변수 MASTER_KEY에서 로드합니다.
"""

import os
import base64
import hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _get_master_key() -> bytes:
    """환경변수에서 마스터 키를 가져와 256비트 키로 파생"""
    master = os.getenv("MASTER_KEY", "")
    if not master:
        raise RuntimeError("MASTER_KEY 환경변수가 설정되지 않았습니다.")
    return hashlib.sha256(master.encode()).digest()


def encrypt(plaintext: str) -> str:
    """평문을 AES-256-GCM으로 암호화하여 base64 문자열 반환"""
    key = _get_master_key()
    nonce = os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ciphertext).decode()


def decrypt(token: str) -> str:
    """base64 암호문을 AES-256-GCM으로 복호화하여 평문 반환"""
    key = _get_master_key()
    raw = base64.b64decode(token)
    nonce, ciphertext = raw[:12], raw[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None).decode()
