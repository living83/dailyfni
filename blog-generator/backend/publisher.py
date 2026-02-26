"""
하위 호환 래퍼 — 기존 코드에서 `from publisher import run_publish_task` 등을 그대로 사용 가능.
실제 구현은 blog_publisher.py + se_helpers.py 로 분리됨.
"""

from blog_publisher import (  # noqa: F401
    run_publish_task,
    test_login,
    publish_to_blog as publish_to_naver,
)
