"""
하위 호환 래퍼 — 기존 코드에서 `from publisher import run_publish_task` 등을 그대로 사용 가능.
실제 구현은 cafe_publisher.py + se_helpers.py 로 분리됨.
"""

from cafe_publisher import (  # noqa: F401
    run_publish_task,
    test_login,
    publish_to_cafe as publish_to_naver,
)
