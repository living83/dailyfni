"""
pyautogui_login.py — Xvfb + 실제 Chrome + pyautogui로 네이버 로그인

Playwright는 navigator.webdriver 위장에도 불구하고 네이버에 봇으로 탐지되어
무조건 CAPTCHA가 뜨므로, 다음 우회 방식을 사용한다:

1. Xvfb 가상 디스플레이 위에 진짜 Chrome (google-chrome-stable) 실행
2. CDP(remote-debugging-port)로 페이지 제어 (네비게이션 / 좌표 조회 / 쿠키 추출)
3. 실제 마우스/키보드 입력은 pyautogui로 OS 레벨 X 이벤트로 발생시켜
   봇 탐지(navigator.webdriver, CDP 입력 시그니처 등)를 우회

쿠키는 CDP Network.getAllCookies로 뽑아 Playwright 호환 형식으로 변환 후
기존 _save_encrypted_cookies()로 data/cookies/account_{id}.enc 에 저장한다.
"""

import asyncio
import json
import os
import shutil
import signal
import subprocess
import sys
import time
from contextlib import suppress
from pathlib import Path
from typing import Optional

import httpx
import websockets
from loguru import logger

from se_helpers import settings


def _ensure_x_env():
    """
    pyautogui import 전에 X 관련 환경을 정돈한다.
    - ~/.Xauthority: python3-Xlib(=mouseinfo)가 무조건 읽으려 하므로 빈 파일이라도 생성.
    - XDG_SESSION_TYPE=x11: pyscreeze가 import 시점에 이 변수로 X11/Wayland를 판별,
      없으면 "gnome-screenshot 설치하라"는 예외를 던지고 scrot으로 fallback도 안 함.
    Xvfb는 인증 없이 동작하므로 .Xauthority 내용은 무관하다.
    """
    os.environ["XDG_SESSION_TYPE"] = "x11"
    home = os.environ.get("HOME") or "/root"
    xauth = os.environ.get("XAUTHORITY") or os.path.join(home, ".Xauthority")
    try:
        Path(xauth).touch(exist_ok=True)
        os.environ.setdefault("XAUTHORITY", xauth)
    except Exception:
        pass


def _reset_x_modules():
    """
    동일 pm2 프로세스에서 2번째 이상 발행 시 BrokenPipe가 나는 문제 우회.
    pyautogui / pyscreeze / mouseinfo / Xlib는 import 시점에 X 서버에 연결을
    맺고 모듈 전역에 캐시한다. 이전 발행에서 Xvfb가 종료되면 캐시된 X 소켓이
    stale 상태가 되어 다음 입력 시 BrokenPipeError가 발생한다.
    sys.modules에서 제거해서 다음 import 때 새 X 연결을 맺도록 강제한다.
    """
    import sys
    roots = ("Xlib", "pyautogui", "pyscreeze", "mouseinfo", "pynput")
    sub_prefixes = tuple(r + "." for r in roots)
    for mod_name in list(sys.modules):
        if mod_name in roots or mod_name.startswith(sub_prefixes):
            del sys.modules[mod_name]


def _setup_pyautogui():
    _ensure_x_env()
    _reset_x_modules()
    import pyautogui
    pyautogui.FAILSAFE = False
    pyautogui.PAUSE = 0.05
    return pyautogui


# ──────────────────────────────────────────────────────────────
# CDP 헬퍼
# ──────────────────────────────────────────────────────────────

async def _connect_ws_with_retry(get_target_url, attempts: int = 3, per_attempt_timeout: float = 15.0):
    """
    Chrome CDP의 WebSocket handshake가 pm2/uvicorn 환경에서 가끔 hang 되는
    현상이 있어 짧은 timeout으로 여러 번 재시도한다. 매 시도마다 page target을
    새로 조회해서, 직전 시도가 stale connection을 남겼더라도 다음 시도는
    fresh URL로 진행되도록 한다.
    """
    last_err: Optional[BaseException] = None
    for attempt in range(1, attempts + 1):
        if callable(get_target_url):
            t = await get_target_url()
            url = t["webSocketDebuggerUrl"] if isinstance(t, dict) else t
        else:
            url = get_target_url
        try:
            return await websockets.connect(
                url,
                max_size=20 * 1024 * 1024,
                open_timeout=per_attempt_timeout,
            )
        except (asyncio.TimeoutError, TimeoutError) as e:
            last_err = e
            logger.warning(
                f"[cdp] WS handshake timeout (attempt {attempt}/{attempts}, "
                f"{per_attempt_timeout}s) → 재시도"
            )
            await asyncio.sleep(0.5)
    raise RuntimeError(
        f"WS handshake가 {attempts}회 시도 모두 실패: {last_err}"
    )


class _CDP:
    def __init__(self, port: int):
        self.port = port
        self._msg_id = 0

    async def _http_get(self, path: str) -> dict:
        async with httpx.AsyncClient(timeout=5.0) as c:
            r = await c.get(f"http://127.0.0.1:{self.port}{path}")
            r.raise_for_status()
            return r.json()

    async def wait_ready(self, timeout: float = 30.0):
        """
        Chrome의 /json/version HTTP는 WS endpoint보다 먼저 응답하기 시작하는
        경우가 있어, HTTP 응답 후에도 page target이 잡힐 때까지 한 번 더 폴링한다.
        """
        deadline = time.monotonic() + timeout
        last_err = None
        http_ok = False
        while time.monotonic() < deadline:
            try:
                if not http_ok:
                    await self._http_get("/json/version")
                    http_ok = True
                # /json/version은 WS 준비 전에 200을 줄 수 있으므로 page target도 확인
                targets = await self._http_get("/json")
                if any(
                    t.get("type") == "page" and t.get("webSocketDebuggerUrl")
                    for t in targets
                ):
                    return
            except Exception as e:
                last_err = e
            await asyncio.sleep(0.3)
        raise RuntimeError(f"Chrome CDP가 {timeout}s 안에 준비되지 않음: {last_err}")

    async def page_target(self) -> dict:
        targets = await self._http_get("/json")
        for t in targets:
            if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                return t
        raise RuntimeError("CDP page target 없음")

    async def _ws(self):
        return await _connect_ws_with_retry(self.page_target)

    async def _send(self, ws, method: str, params: Optional[dict] = None) -> dict:
        self._msg_id += 1
        mid = self._msg_id
        await ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        while True:
            raw = await asyncio.wait_for(ws.recv(), timeout=15.0)
            msg = json.loads(raw)
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"CDP 오류 {method}: {msg['error']}")
                return msg.get("result", {})

    async def navigate(self, url: str):
        async with await self._ws() as ws:
            await self._send(ws, "Page.enable")
            await self._send(ws, "Page.navigate", {"url": url})
            await asyncio.sleep(0.5)

    async def current_url(self) -> str:
        t = await self.page_target()
        return t.get("url", "")

    async def eval_js(self, expression: str) -> dict:
        async with await self._ws() as ws:
            res = await self._send(ws, "Runtime.evaluate", {
                "expression": expression,
                "returnByValue": True,
                "awaitPromise": True,
            })
            return res.get("result", {})

    async def element_center(self, selector: str) -> Optional[tuple[int, int]]:
        js = f"""
        (() => {{
            const el = document.querySelector({json.dumps(selector)});
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {{
                x: Math.round(r.left + r.width / 2),
                y: Math.round(r.top + r.height / 2),
                w: Math.round(r.width),
                h: Math.round(r.height),
            }};
        }})()
        """
        res = await self.eval_js(js)
        val = res.get("value")
        if not val:
            return None
        return int(val["x"]), int(val["y"])

    async def body_text(self) -> str:
        res = await self.eval_js("document.body && document.body.innerText || ''")
        return str(res.get("value") or "")

    async def get_cookies(self) -> list[dict]:
        async with await self._ws() as ws:
            await self._send(ws, "Network.enable")
            res = await self._send(ws, "Network.getAllCookies")
            return res.get("cookies", [])


# ──────────────────────────────────────────────────────────────
# 인증 프록시용 CDP Fetch 핸들러
# ──────────────────────────────────────────────────────────────

class ProxyAuthHandler:
    def __init__(self, cdp: "_CDP", username: str, password: str):
        self.cdp = cdp
        self.username = username
        self.password = password
        self._ws = None
        self._task: Optional[asyncio.Task] = None
        self._msg_id = 1_000_000

    async def start(self):
        self._ws = await _connect_ws_with_retry(self.cdp.page_target)
        await self._send("Fetch.enable", {
            "handleAuthRequests": True,
            "patterns": [{"urlPattern": "*"}],
        })
        self._task = asyncio.create_task(self._loop())
        logger.info("[proxy-auth] CDP Fetch 핸들러 시작")

    async def _send(self, method: str, params: Optional[dict] = None):
        self._msg_id += 1
        await self._ws.send(json.dumps({
            "id": self._msg_id,
            "method": method,
            "params": params or {},
        }))

    async def _loop(self):
        try:
            async for raw in self._ws:
                msg = json.loads(raw)
                method = msg.get("method")
                params = msg.get("params") or {}
                if method == "Fetch.authRequired":
                    rid = params["requestId"]
                    src = (params.get("authChallenge") or {}).get("source")
                    if src == "Proxy":
                        await self._send("Fetch.continueWithAuth", {
                            "requestId": rid,
                            "authChallengeResponse": {
                                "response": "ProvideCredentials",
                                "username": self.username,
                                "password": self.password,
                            },
                        })
                    else:
                        await self._send("Fetch.continueWithAuth", {
                            "requestId": rid,
                            "authChallengeResponse": {"response": "Default"},
                        })
                elif method == "Fetch.requestPaused":
                    await self._send("Fetch.continueRequest", {
                        "requestId": params["requestId"],
                    })
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning(f"[proxy-auth] 핸들러 루프 종료: {e}")

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except Exception:
                pass
        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass


# ──────────────────────────────────────────────────────────────
# 디스플레이 + Chrome 라이프사이클
# ──────────────────────────────────────────────────────────────

class XvfbChromeSession:
    """
    Xvfb 디스플레이를 띄우고 그 안에서 google-chrome (kiosk)을 기동한다.
    kiosk 모드는 툴바/타이틀바가 없어 viewport 좌표 = pyautogui 화면 좌표.
    """

    def __init__(
        self,
        account_id,
        proxy: Optional[dict] = None,
        size: tuple[int, int] = (1920, 1080),
        debug_port: Optional[int] = None,
        user_data_dir: Optional[Path] = None,
        keep_user_data: bool = False,
    ):
        self.account_id = account_id
        self.proxy = proxy
        self.width, self.height = size
        try:
            seed = int(account_id)
        except (TypeError, ValueError):
            seed = abs(hash(str(account_id)))
        self.debug_port = debug_port or (9222 + (seed % 1000))
        safe_id = str(account_id).replace("/", "_")
        self.user_data_dir = Path(user_data_dir) if user_data_dir else Path(
            f"/tmp/pyagui_chrome_cafe_account_{safe_id}"
        )
        self.keep_user_data = keep_user_data
        self._display = None
        self._chrome: Optional[subprocess.Popen] = None
        self._prev_display = None

    def __enter__(self):
        from pyvirtualdisplay import Display
        self._display = Display(visible=0, size=(self.width, self.height), color_depth=24)
        self._display.start()
        self._prev_display = os.environ.get("DISPLAY")
        os.environ["DISPLAY"] = self._display.new_display_var
        logger.info(
            f"[계정 {self.account_id}] Xvfb 디스플레이 시작: "
            f"{os.environ['DISPLAY']} ({self.width}x{self.height})"
        )

        if self.user_data_dir.exists() and not self.keep_user_data:
            shutil.rmtree(self.user_data_dir, ignore_errors=True)
        self.user_data_dir.mkdir(parents=True, exist_ok=True)

        chrome_bin = shutil.which("google-chrome") or shutil.which("google-chrome-stable")
        if not chrome_bin:
            raise RuntimeError("google-chrome 실행 파일을 찾을 수 없습니다.")

        args = [
            chrome_bin,
            f"--user-data-dir={self.user_data_dir}",
            f"--remote-debugging-port={self.debug_port}",
            "--remote-allow-origins=*",
            f"--window-size={self.width},{self.height}",
            "--window-position=0,0",
            "--kiosk",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-blink-features=AutomationControlled",
            "--disable-features=ThirdPartyCookieBlocking,ThirdPartyCookiePhaseout,"
            "TrackingProtection3pcd,PartitionedCookies",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--lang=ko-KR",
        ]
        if self.proxy and self.proxy.get("server"):
            args.append(f"--proxy-server={self.proxy['server']}")
        args.append("about:blank")

        self._chrome = subprocess.Popen(
            args,
            env={**os.environ},
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            preexec_fn=os.setsid,
        )
        logger.info(
            f"[계정 {self.account_id}] Chrome 시작: pid={self._chrome.pid} "
            f"port={self.debug_port}"
        )
        return self

    def __exit__(self, exc_type, exc, tb):
        with suppress(Exception):
            if self._chrome and self._chrome.poll() is None:
                os.killpg(os.getpgid(self._chrome.pid), signal.SIGTERM)
                try:
                    self._chrome.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(os.getpgid(self._chrome.pid), signal.SIGKILL)
        with suppress(Exception):
            if self._display:
                self._display.stop()
        if self._prev_display is not None:
            os.environ["DISPLAY"] = self._prev_display
        else:
            os.environ.pop("DISPLAY", None)
        if not self.keep_user_data:
            shutil.rmtree(self.user_data_dir, ignore_errors=True)


# ──────────────────────────────────────────────────────────────
# CDP cookies → Playwright cookie 형식 변환
# ──────────────────────────────────────────────────────────────

def _cdp_cookie_to_playwright(c: dict) -> dict:
    out: dict = {
        "name": c.get("name", ""),
        "value": c.get("value", ""),
        "domain": c.get("domain", ""),
        "path": c.get("path", "/"),
        "secure": bool(c.get("secure", False)),
        "httpOnly": bool(c.get("httpOnly", False)),
    }
    expires = c.get("expires")
    if expires is not None and expires > 0:
        out["expires"] = float(expires)
    same = c.get("sameSite")
    if same in ("Strict", "Lax", "None"):
        out["sameSite"] = same
    return out


# ──────────────────────────────────────────────────────────────
# 네이버 로그인 자동화 (pyautogui)
# ──────────────────────────────────────────────────────────────

NAVER_LOGIN_URL = "https://nid.naver.com/nidlogin.login"
NAVER_MAIN_URL = "https://www.naver.com/"


async def _click_screen(x: int, y: int):
    pg = _setup_pyautogui()
    pg.moveTo(x, y, duration=0.15)
    await asyncio.sleep(0.1)
    pg.click(x, y)
    await asyncio.sleep(0.2)


async def _type_text(text: str, interval: float = 0.06):
    pg = _setup_pyautogui()
    pg.write(text, interval=interval)
    await asyncio.sleep(0.1)


async def _press(key: str):
    pg = _setup_pyautogui()
    pg.press(key)
    await asyncio.sleep(0.1)


async def _login_naver_in_process(
    naver_id: str,
    naver_password: str,
    account_id,
    proxy: Optional[dict] = None,
) -> bool:
    """
    Xvfb + 실제 Chrome + pyautogui로 네이버 로그인을 수행하고
    성공 시 쿠키를 data/cookies/account_{id}.enc 로 저장.

    NOTE: 이 함수는 X-using 모듈을 import한다. 같은 프로세스에서 두 번 이상
    실행하면 캐시된 X 연결이 stale 되어 BrokenPipeError가 발생할 수 있다.
    부모 프로세스에서 동시·반복 실행은 항상 `login_naver_with_pyautogui`
    (subprocess wrapper)를 통해서만 호출해야 한다.
    """
    from se_helpers import _save_encrypted_cookies  # noqa

    cookie_path = settings.COOKIES_DIR / f"account_{account_id}.enc"

    try:
        with XvfbChromeSession(account_id=account_id, proxy=proxy) as sess:
            cdp = _CDP(sess.debug_port)
            await cdp.wait_ready(timeout=30.0)

            auth_handler: Optional[ProxyAuthHandler] = None
            if proxy and proxy.get("username"):
                auth_handler = ProxyAuthHandler(
                    cdp, proxy["username"], proxy.get("password", "")
                )
                await auth_handler.start()

            try:
                await cdp.navigate(NAVER_MAIN_URL)
                await asyncio.sleep(2.0)
                await cdp.navigate(NAVER_LOGIN_URL)
            except Exception:
                if auth_handler:
                    await auth_handler.stop()
                raise

            id_xy = None
            for _ in range(40):
                id_xy = await cdp.element_center("#id")
                if id_xy:
                    break
                await asyncio.sleep(0.5)
            if not id_xy:
                logger.error(f"[계정 {account_id}] #id 입력 필드를 찾지 못함")
                return False

            await _click_screen(*id_xy)
            await _type_text(naver_id)

            pw_xy = await cdp.element_center("#pw")
            if not pw_xy:
                logger.error(f"[계정 {account_id}] #pw 입력 필드를 찾지 못함")
                return False
            await _click_screen(*pw_xy)
            await _type_text(naver_password)

            btn_xy = await cdp.element_center("#log\\.login, .btn_login, button[type='submit']")
            if not btn_xy:
                btn_xy = await cdp.element_center(".btn_login")
            if btn_xy:
                await _click_screen(*btn_xy)
            else:
                await _press("enter")

            # 성공 판정: 로그인 POST 후 nidlogin 도메인을 벗어나면 성공.
            # 24*0.5=12s는 레지던셜 프록시로 제출이 느린 라운드(버튼 스피너 유지)를
            # 성공인데도 실패로 클립하는 경우가 있어 50*0.5=25s로 확대
            # (subprocess 타임아웃 180s 내라 여유 충분).
            success = False
            for _ in range(50):
                await asyncio.sleep(0.5)
                url = await cdp.current_url()
                if "nidlogin" not in url and "nid.naver.com" not in url:
                    success = True
                    break

            text = await cdp.body_text()
            if any(k in text for k in ("허용하지 않은 지역", "본인확인이 필요", "휴대전화 번호")):
                logger.error(
                    f"[계정 {account_id}] ❌ pyautogui 로그인 — 본인인증 요구 감지 (IP 차단)"
                )
                return False

            if not success:
                url = await cdp.current_url()
                if "nidlogin" not in url:
                    success = True

            if not success:
                captcha_check = await cdp.eval_js(
                    "(()=>{const el=document.querySelector('.captcha_wrap'); return el ? el.innerText.slice(0,400) : null;})()"
                )
                cap_text = captcha_check.get("value")
                if cap_text:
                    logger.warning(
                        f"[계정 {account_id}] CAPTCHA 감지 — 스킵 (다음 발행 사이클에서 재시도)\n"
                        f"질문: {cap_text[:200]}"
                    )
                    return False

            if not success:
                fail_url = await cdp.current_url()
                try:
                    pg = _setup_pyautogui()
                    debug_dir = settings.DATA_DIR / "debug_screenshots"
                    debug_dir.mkdir(parents=True, exist_ok=True)
                    shot_path = debug_dir / f"pyagui_login_fail_{account_id}.png"
                    pg.screenshot().save(str(shot_path))
                    logger.warning(f"[계정 {account_id}] 실패 스크린샷: {shot_path}")
                except Exception as se:
                    logger.warning(f"실패 스크린샷 저장 실패: {se}")
                try:
                    body_snippet = (await cdp.body_text())[:600].replace("\n", " | ")
                    logger.warning(f"[계정 {account_id}] body 일부: {body_snippet}")
                except Exception as e2:
                    logger.warning(f"실패 진단 실패: {e2}")
                logger.warning(
                    f"[계정 {account_id}] pyautogui 로그인 실패 — URL: {fail_url}"
                )
                return False

            cdp_cookies = await cdp.get_cookies()
            playwright_cookies = [_cdp_cookie_to_playwright(c) for c in cdp_cookies if c.get("name")]
            if not playwright_cookies:
                logger.error(f"[계정 {account_id}] pyautogui 로그인 — 쿠키 추출 실패(빈 목록)")
                return False

            _save_encrypted_cookies(cookie_path, playwright_cookies)
            logger.info(
                f"[계정 {account_id}] ✅ pyautogui 로그인 성공 — "
                f"쿠키 {len(playwright_cookies)}개 저장 → {cookie_path.name}"
            )
            return True

    except Exception as e:
        logger.exception(f"[계정 {account_id}] pyautogui 로그인 예외: {e}")
        return False


# ──────────────────────────────────────────────────────────────
# subprocess 격리 wrapper (병렬 호출용 진입점)
# ──────────────────────────────────────────────────────────────

LOGIN_SUBPROCESS_TIMEOUT = 180.0  # 한 번의 로그인 + Xvfb + Chrome 부팅까지 여유

async def login_naver_with_pyautogui(
    naver_id: str,
    naver_password: str,
    account_id,
    proxy: Optional[dict] = None,
) -> bool:
    """
    DisplayPool 슬롯 acquire 후 별도 Python subprocess에서 in-process 로그인을
    수행한다. mouseinfo / Xlib 등 X-using 모듈이 모듈 전역으로 X 연결을
    캐시하는 문제를 우회하기 위함.

    시그니처는 기존 in-process 함수와 동일해서 호출하는 쪽 (se_helpers.login)은
    수정 불필요.
    """
    from display_pool import get_display_pool

    pool = get_display_pool()
    async with pool.acquire() as display_num:
        return await _run_login_subprocess(
            naver_id=naver_id,
            naver_password=naver_password,
            account_id=account_id,
            proxy=proxy,
            display_num=display_num,
        )


async def _run_login_subprocess(
    naver_id: str,
    naver_password: str,
    account_id,
    proxy: Optional[dict],
    display_num: int,
) -> bool:
    backend_dir = Path(__file__).resolve().parent
    venv_python = sys.executable  # uvicorn이 우리 venv를 쓰므로 그대로 상속
    payload = json.dumps({
        "naver_id": naver_id,
        "naver_password": naver_password,
        "account_id": account_id,
        "proxy": proxy,
        "display_num": display_num,
    })

    env = {**os.environ}
    # 부모의 DISPLAY가 무엇이든 자식은 자기 Xvfb를 띄우므로 흘려넣지 않는다
    env.pop("DISPLAY", None)

    proc = await asyncio.create_subprocess_exec(
        venv_python,
        "-m", "pyautogui_login_runner",
        cwd=str(backend_dir),
        env=env,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(input=payload.encode()),
            timeout=LOGIN_SUBPROCESS_TIMEOUT,
        )
    except asyncio.TimeoutError:
        with suppress(Exception):
            proc.kill()
            await proc.wait()
        logger.error(
            f"[계정 {account_id}] 로그인 subprocess 타임아웃 "
            f"({LOGIN_SUBPROCESS_TIMEOUT}s) display_slot=:{display_num}"
        )
        return False

    if stderr:
        # 자식 stderr는 우리 디버그 로거로 그대로 전달
        for line in stderr.decode(errors="replace").splitlines():
            if line.strip():
                logger.debug(f"[계정 {account_id}][:{display_num}] {line}")

    out_text = stdout.decode(errors="replace").strip()
    if not out_text:
        logger.error(
            f"[계정 {account_id}] 로그인 subprocess 빈 stdout "
            f"(rc={proc.returncode}, slot=:{display_num})"
        )
        return False

    last_line = out_text.splitlines()[-1]
    try:
        result = json.loads(last_line)
    except Exception:
        logger.error(
            f"[계정 {account_id}] 로그인 subprocess 출력 파싱 실패 "
            f"(slot=:{display_num}): {last_line!r}"
        )
        return False

    if result.get("success"):
        logger.info(
            f"[계정 {account_id}] ✅ subprocess 로그인 성공 (slot=:{display_num})"
        )
        return True

    err = result.get("error") or "unknown"
    logger.warning(
        f"[계정 {account_id}] subprocess 로그인 실패 (slot=:{display_num}): {err}"
    )
    return False
