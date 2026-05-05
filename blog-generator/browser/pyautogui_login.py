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
import time
from contextlib import suppress
from pathlib import Path
from typing import Optional

import httpx
import websockets
from loguru import logger

from config import settings


def _ensure_x_env():
    """
    pyautogui import 전에 X 관련 환경을 정돈한다.
    - ~/.Xauthority: python3-Xlib(=mouseinfo)가 무조건 읽으려 하므로 빈 파일이라도 생성.
    - XDG_SESSION_TYPE=x11: pyscreeze가 import 시점에 이 변수로 X11/Wayland를 판별,
      없으면 "gnome-screenshot 설치하라"는 예외를 던지고 scrot으로 fallback도 안 함.
    Xvfb는 인증 없이 동작하므로 .Xauthority 내용은 무관하다.
    """
    # 강제 덮어쓰기 — SSH 세션에서 XDG_SESSION_TYPE=tty가 상속되어 오면
    # pyscreeze가 X11도 Wayland도 아니라고 판단해 스크린샷을 거부함.
    os.environ["XDG_SESSION_TYPE"] = "x11"
    home = os.environ.get("HOME") or "/root"
    xauth = os.environ.get("XAUTHORITY") or os.path.join(home, ".Xauthority")
    try:
        Path(xauth).touch(exist_ok=True)
        os.environ.setdefault("XAUTHORITY", xauth)
    except Exception:
        pass


# pyautogui 전역 안전장치(코너에 마우스 가면 예외) 비활성 + 입력 텀
def _setup_pyautogui():
    _ensure_x_env()
    import pyautogui
    pyautogui.FAILSAFE = False
    pyautogui.PAUSE = 0.05
    return pyautogui


# ──────────────────────────────────────────────────────────────
# CDP 헬퍼
# ──────────────────────────────────────────────────────────────

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
        deadline = time.monotonic() + timeout
        last_err = None
        while time.monotonic() < deadline:
            try:
                await self._http_get("/json/version")
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
        t = await self.page_target()
        return await websockets.connect(t["webSocketDebuggerUrl"], max_size=20 * 1024 * 1024)

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
            # domcontentloaded 정도 대기
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
        """selector 요소의 화면(=viewport, kiosk 모드) 중앙 좌표를 반환."""
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
            res = await self._send(ws, "Network.enable")
            res = await self._send(ws, "Network.getAllCookies")
            return res.get("cookies", [])


# ──────────────────────────────────────────────────────────────
# 인증 프록시용 CDP Fetch 핸들러
# ──────────────────────────────────────────────────────────────
# Chrome은 `--proxy-server`에 user:pass를 받지 않고, 안정판은
# `--load-extension`/`--disable-extensions-except`도 거부한다 (개발 모드 전용).
# 그래서 페이지 타깃의 CDP WS에 상주시키며 Fetch.authRequired 이벤트에
# 자격증명을 제공하고, Fetch.requestPaused는 그대로 통과시키는 핸들러를 둔다.

class ProxyAuthHandler:
    def __init__(self, cdp: "_CDP", username: str, password: str):
        self.cdp = cdp
        self.username = username
        self.password = password
        self._ws = None
        self._task: Optional[asyncio.Task] = None
        self._msg_id = 1_000_000

    async def start(self):
        page = await self.cdp.page_target()
        self._ws = await websockets.connect(
            page["webSocketDebuggerUrl"], max_size=20 * 1024 * 1024
        )
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
# 인증 프록시용 임시 Chrome 확장 (MV2 webRequestBlocking)
# ──────────────────────────────────────────────────────────────

def _write_proxy_auth_extension(ext_dir: Path, username: str, password: str) -> Path:
    """
    Chrome `--proxy-server`는 URL의 user:pass 부분을 무시하므로,
    인증 프록시를 쓰려면 onAuthRequired 콜백을 등록하는 확장이 필요하다.
    MV2가 webRequestBlocking을 가장 단순하게 지원해서 그걸 쓴다.
    """
    ext_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "version": "1.0.0",
        "manifest_version": 2,
        "name": "Proxy Auth Helper",
        "permissions": [
            "proxy",
            "tabs",
            "unlimitedStorage",
            "storage",
            "<all_urls>",
            "webRequest",
            "webRequestBlocking",
        ],
        "background": {"scripts": ["background.js"]},
        "minimum_chrome_version": "76.0.0",
    }
    # 자격증명을 JS string literal로 안전 escape
    u = json.dumps(username)
    p = json.dumps(password)
    background = (
        "chrome.webRequest.onAuthRequired.addListener(\n"
        "  function(details) {\n"
        "    if (details.isProxy) {\n"
        f"      return {{ authCredentials: {{ username: {u}, password: {p} }} }};\n"
        "    }\n"
        "    return {};\n"
        "  },\n"
        "  { urls: ['<all_urls>'] },\n"
        "  ['blocking']\n"
        ");\n"
    )
    (ext_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))
    (ext_dir / "background.js").write_text(background)
    return ext_dir


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
        account_id: int,
        proxy: Optional[dict] = None,
        size: tuple[int, int] = (1920, 1080),
        debug_port: Optional[int] = None,
        user_data_dir: Optional[Path] = None,
        keep_user_data: bool = False,
    ):
        self.account_id = account_id
        self.proxy = proxy
        self.width, self.height = size
        # 계정별로 포트가 겹치지 않게 9222 + (id mod 1000)
        self.debug_port = debug_port or (9222 + (int(account_id) % 1000))
        self.user_data_dir = Path(user_data_dir) if user_data_dir else Path(
            f"/tmp/pyagui_chrome_account_{account_id}"
        )
        self.keep_user_data = keep_user_data
        self._display = None
        self._chrome: Optional[subprocess.Popen] = None
        self._prev_display = None

    def __enter__(self):
        from pyvirtualdisplay import Display
        # Xvfb 시작
        self._display = Display(visible=0, size=(self.width, self.height), color_depth=24)
        self._display.start()
        # pyautogui가 보는 DISPLAY 환경변수 갱신 (process-wide)
        self._prev_display = os.environ.get("DISPLAY")
        os.environ["DISPLAY"] = self._display.new_display_var
        logger.info(
            f"[계정 {self.account_id}] Xvfb 디스플레이 시작: "
            f"{os.environ['DISPLAY']} ({self.width}x{self.height})"
        )

        # 사용자 데이터 디렉토리 — 매번 새로 시작 (쿠키 추출만 할 거라)
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
            "--kiosk",                       # 툴바/타이틀바 제거 → viewport == 화면
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
            # NOTE: Chrome `--proxy-server`는 URL의 user:pass를 무시하고,
            # 안정판은 `--load-extension`도 거부하므로 인증 프록시는
            # CDP의 ProxyAuthHandler(Fetch)로 별도 처리.
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
        # DISPLAY 환경변수 복원
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
    """
    CDP Network.Cookie → playwright add_cookies 형식.
    name/value/domain/path 외 expires/secure/httpOnly/sameSite 보존.
    """
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
    """ASCII만 안전 — 네이버 ID/PW는 영숫자/기호 가정."""
    pg = _setup_pyautogui()
    pg.write(text, interval=interval)
    await asyncio.sleep(0.1)


async def _press(key: str):
    pg = _setup_pyautogui()
    pg.press(key)
    await asyncio.sleep(0.1)


async def login_naver_with_pyautogui(
    naver_id: str,
    naver_password: str,
    account_id: int,
    proxy: Optional[dict] = None,
) -> bool:
    """
    Xvfb + 실제 Chrome + pyautogui로 네이버 로그인을 수행하고
    성공 시 쿠키를 data/cookies/account_{id}.enc 로 저장.
    """
    from browser.se_helpers import _save_encrypted_cookies, _share_cookies_for_cbox  # noqa

    cookie_path = settings.COOKIES_DIR / f"account_{account_id}.enc"

    try:
        with XvfbChromeSession(account_id=account_id, proxy=proxy) as sess:
            cdp = _CDP(sess.debug_port)
            await cdp.wait_ready(timeout=30.0)

            # 인증 프록시면 CDP Fetch 핸들러를 페이지 target에 부착
            auth_handler: Optional[ProxyAuthHandler] = None
            if proxy and proxy.get("username"):
                auth_handler = ProxyAuthHandler(
                    cdp, proxy["username"], proxy.get("password", "")
                )
                await auth_handler.start()

            try:
                # warm-up: 메인 → 로그인 페이지 (봇 탐지 우회)
                await cdp.navigate(NAVER_MAIN_URL)
                await asyncio.sleep(2.0)
                await cdp.navigate(NAVER_LOGIN_URL)
            except Exception:
                if auth_handler:
                    await auth_handler.stop()
                raise

            # 입력 필드 렌더 대기
            id_xy = None
            for _ in range(40):
                id_xy = await cdp.element_center("#id")
                if id_xy:
                    break
                await asyncio.sleep(0.5)
            if not id_xy:
                logger.error(f"[계정 {account_id}] #id 입력 필드를 찾지 못함")
                return False

            # ID 입력
            await _click_screen(*id_xy)
            await _type_text(naver_id)

            # PW 필드
            pw_xy = await cdp.element_center("#pw")
            if not pw_xy:
                logger.error(f"[계정 {account_id}] #pw 입력 필드를 찾지 못함")
                return False
            await _click_screen(*pw_xy)
            await _type_text(naver_password)

            # 로그인 버튼 클릭 (없으면 Enter)
            btn_xy = await cdp.element_center("#log\\.login, .btn_login, button[type='submit']")
            if not btn_xy:
                btn_xy = await cdp.element_center(".btn_login")
            if btn_xy:
                await _click_screen(*btn_xy)
            else:
                await _press("enter")

            # 결과 대기 — 최대 12초간 URL 변화 폴링
            success = False
            for _ in range(24):
                await asyncio.sleep(0.5)
                url = await cdp.current_url()
                if "nidlogin" not in url and "nid.naver.com" not in url:
                    success = True
                    break

            # 본인인증/허용 안 된 지역 차단 감지
            text = await cdp.body_text()
            if any(k in text for k in ("허용하지 않은 지역", "본인확인이 필요", "휴대전화 번호")):
                logger.error(
                    f"[계정 {account_id}] ❌ pyautogui 로그인 — 본인인증 요구 감지 (IP 차단)"
                )
                return False

            if not success:
                # 한 번 더 URL 확인
                url = await cdp.current_url()
                if "nidlogin" not in url:
                    success = True

            if not success:
                logger.warning(
                    f"[계정 {account_id}] pyautogui 로그인 실패 — URL: {await cdp.current_url()}"
                )
                return False

            # 쿠키 추출 + 암호화 저장
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
