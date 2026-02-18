"""
AES-256 대체 암호화/복호화 유틸리티 (Python 표준 라이브러리만 사용)
HMAC-SHA256 기반 스트림 암호 + HMAC 인증 태그
마스터 키는 환경변수 MASTER_KEY에서 로드합니다.
"""

import os
import base64
import hashlib
import hmac
import struct


def _get_master_key() -> bytes:
    """환경변수에서 마스터 키를 가져와 256비트 키로 파생"""
    master = os.getenv("MASTER_KEY", "")
    if not master:
        raise RuntimeError("MASTER_KEY 환경변수가 설정되지 않았습니다.")
    return hashlib.sha256(master.encode()).digest()


def _derive_keys(master_key: bytes, nonce: bytes) -> tuple:
    """마스터 키와 nonce로부터 암호화 키와 MAC 키를 파생"""
    enc_key = hmac.new(master_key, b"enc" + nonce, hashlib.sha256).digest()
    mac_key = hmac.new(master_key, b"mac" + nonce, hashlib.sha256).digest()
    return enc_key, mac_key


def _keystream(key: bytes, length: int) -> bytes:
    """HMAC-SHA256 카운터 모드로 키스트림 생성"""
    stream = b""
    counter = 0
    while len(stream) < length:
        block = hmac.new(key, struct.pack(">Q", counter), hashlib.sha256).digest()
        stream += block
        counter += 1
    return stream[:length]


def encrypt(plaintext: str) -> str:
    """평문을 암호화하여 base64 문자열 반환"""
    key = _get_master_key()
    nonce = os.urandom(16)
    enc_key, mac_key = _derive_keys(key, nonce)

    plaintext_bytes = plaintext.encode("utf-8")
    stream = _keystream(enc_key, len(plaintext_bytes))
    ciphertext = bytes(a ^ b for a, b in zip(plaintext_bytes, stream))

    # HMAC 인증 태그
    tag = hmac.new(mac_key, nonce + ciphertext, hashlib.sha256).digest()

    # nonce(16) + tag(32) + ciphertext
    return base64.b64encode(nonce + tag + ciphertext).decode()


def decrypt(token: str) -> str:
    """base64 암호문을 복호화하여 평문 반환"""
    key = _get_master_key()
    raw = base64.b64decode(token)

    nonce = raw[:16]
    tag = raw[16:48]
    ciphertext = raw[48:]

    enc_key, mac_key = _derive_keys(key, nonce)

    # HMAC 검증
    expected_tag = hmac.new(mac_key, nonce + ciphertext, hashlib.sha256).digest()
    if not hmac.compare_digest(tag, expected_tag):
        raise ValueError("복호화 실패: 데이터가 변조되었거나 키가 올바르지 않습니다.")

    stream = _keystream(enc_key, len(ciphertext))
    plaintext_bytes = bytes(a ^ b for a, b in zip(ciphertext, stream))

    return plaintext_bytes.decode("utf-8")
