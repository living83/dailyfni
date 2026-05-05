"""
pyautogui 로그인을 격리된 subprocess에서 수행하는 CLI runner.

부모 프로세스가 같은 Python 인스턴스 안에서 pyautogui를 동시에 N개 돌리면
mouseinfo / pyscreeze / Xlib가 import 시점 X 연결을 모듈 전역으로 캐시하기
때문에 두 번째 호출부터 BrokenPipeError 가 나거나 다른 디스플레이로 입력이
들어간다. 이를 우회하려고 매 발행마다 별도 Python 프로세스를 띄워 X 모듈을
완전히 격리한다.

입출력 프로토콜:
  - 입력 (stdin, single JSON): {
        "naver_id": str,
        "naver_password": str,
        "account_id": int|str,
        "proxy": {"server": ..., "username": ..., "password": ...} | null,
        "display_num": int   // 진단용 라벨; pyvirtualdisplay가 실제 번호를 자동 선택
    }
  - 출력 (stdout, 마지막 줄 single JSON):
        {"success": true, "cookie_count": int, "display_num": int}
        또는
        {"success": false, "error": str}
  - stderr: 로깅

성공 시 쿠키는 기존과 동일하게 data/cookies/account_{id}.enc 에 저장된다.
부모는 그 파일을 읽어 Playwright context에 주입하므로 IPC로 쿠키를 넘기지
않는다.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from pathlib import Path


def _setup_logging():
    logging.basicConfig(
        stream=sys.stderr,
        level=logging.INFO,
        format="[runner:%(process)d] %(asctime)s %(levelname)s %(name)s: %(message)s",
        force=True,
    )


async def _main():
    _setup_logging()
    sys.path.insert(0, str(Path(__file__).resolve().parent))

    raw = sys.stdin.read()
    try:
        payload = json.loads(raw)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"invalid stdin JSON: {e}"}))
        return

    naver_id = payload.get("naver_id")
    naver_password = payload.get("naver_password")
    account_id = payload.get("account_id")
    proxy = payload.get("proxy")
    display_num = payload.get("display_num")

    if not naver_id or not naver_password or account_id is None:
        print(json.dumps({"success": False, "error": "missing required fields"}))
        return

    # display_num은 부모 진단/로깅용. 자식 안에서는 pyvirtualdisplay이 실제 번호를
    # 자동 선택하므로 여기서 강제하지 않는다 (subprocess끼리는 어차피 격리됨).
    log = logging.getLogger("pyautogui_runner")
    log.info(f"start account_id={account_id} display_slot={display_num}")

    # in-process 로그인 함수를 직접 호출 (wrapper 무한재귀 방지)
    from pyautogui_login import _login_naver_in_process

    try:
        ok = await _login_naver_in_process(
            naver_id=naver_id,
            naver_password=naver_password,
            account_id=account_id,
            proxy=proxy,
        )
        if ok:
            result = {"success": True, "display_num": display_num}
        else:
            result = {"success": False, "error": "login_returned_false"}
    except Exception as e:
        log.exception("login crashed")
        result = {"success": False, "error": f"{type(e).__name__}: {e}"}

    print(json.dumps(result))
    sys.stdout.flush()


if __name__ == "__main__":
    asyncio.run(_main())
