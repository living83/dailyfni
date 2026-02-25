"""
cafe_publisher.py - 네이버 카페 자동 발행
Selenium 기반 카페 글쓰기 / 댓글 자동화

흐름:
1. 로그인: 기존 쿠키 우선 → ID/PW 폴백
2. 카페 이동: cafe.naver.com/{카페URL} 접속
3. 게시판 선택: 지정된 게시판(menuId) 클릭
4. 글쓰기: SE ONE 에디터에서 제목/본문 입력 (가운데 정렬, 문단 여백)
5. 이미지: 대표이미지 삽입
6. 발행: 등록 버튼 클릭 → URL 확인
"""

import json
import time
import random
import logging
from typing import Optional

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

from crypto import decrypt_password

logger = logging.getLogger(__name__)

# ─── 유틸 ──────────────────────────────────────────────────

def random_delay(min_sec: float = 0.5, max_sec: float = 2.0):
    """사람처럼 보이기 위한 랜덤 딜레이"""
    time.sleep(random.uniform(min_sec, max_sec))


def human_type(element, text: str, min_delay: float = 0.03, max_delay: float = 0.12):
    """한 글자씩 사람처럼 타이핑"""
    for char in text:
        element.send_keys(char)
        time.sleep(random.uniform(min_delay, max_delay))


def create_driver(headless: bool = True) -> webdriver.Chrome:
    """Chrome WebDriver 생성"""
    options = Options()
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--window-size=1920,1080")
    options.add_argument(
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)

    driver = webdriver.Chrome(options=options)
    driver.execute_cdp_cmd(
        "Page.addScriptToEvaluateOnNewDocument",
        {"source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"}
    )
    return driver


# ─── 로그인 ────────────────────────────────────────────────

def login_with_cookie(driver: webdriver.Chrome, cookie_data: str) -> bool:
    """저장된 쿠키로 로그인 시도"""
    try:
        driver.get("https://www.naver.com")
        random_delay(1, 2)

        cookies = json.loads(cookie_data)
        for cookie in cookies:
            # 필수 필드만 유지
            clean_cookie = {
                "name": cookie["name"],
                "value": cookie["value"],
                "domain": cookie.get("domain", ".naver.com"),
                "path": cookie.get("path", "/"),
            }
            try:
                driver.add_cookie(clean_cookie)
            except Exception:
                continue

        driver.get("https://www.naver.com")
        random_delay(2, 3)

        # 로그인 확인: 네이버 메일 또는 프로필 요소 존재 여부
        try:
            driver.find_element(By.CSS_SELECTOR, ".MyView-module__link_login___HpHMW")
            return False  # 로그인 버튼이 보이면 실패
        except NoSuchElementException:
            logger.info("쿠키 로그인 성공")
            return True
    except Exception as e:
        logger.warning(f"쿠키 로그인 실패: {e}")
        return False


def login_with_credentials(driver: webdriver.Chrome, username: str, password_enc: str) -> bool:
    """ID/PW로 네이버 로그인"""
    try:
        password = decrypt_password(password_enc)
        driver.get("https://nid.naver.com/nidlogin.login")
        random_delay(2, 3)

        wait = WebDriverWait(driver, 10)

        # 아이디 입력 (클립보드 방식으로 우회)
        id_input = wait.until(EC.presence_of_element_located((By.ID, "id")))
        driver.execute_script(
            f"document.getElementById('id').value = '{username}';"
        )
        random_delay(0.3, 0.8)

        # 비밀번호 입력
        pw_input = driver.find_element(By.ID, "pw")
        driver.execute_script(
            f"document.getElementById('pw').value = arguments[0];", password
        )
        random_delay(0.5, 1.0)

        # 로그인 버튼 클릭
        login_btn = driver.find_element(By.ID, "log.login")
        login_btn.click()
        random_delay(3, 5)

        # 캡챠/2차 인증 체크
        current_url = driver.current_url
        if "nidlogin" in current_url or "captcha" in current_url:
            logger.warning(f"로그인 실패 또는 캡챠 발생: {current_url}")
            return False

        logger.info(f"ID/PW 로그인 성공: {username}")
        return True

    except Exception as e:
        logger.error(f"로그인 중 오류: {e}")
        return False


def get_login_cookies(driver: webdriver.Chrome) -> str:
    """현재 세션 쿠키를 JSON 문자열로 반환"""
    cookies = driver.get_cookies()
    return json.dumps(cookies, ensure_ascii=False)


# ─── 카페 글쓰기 ──────────────────────────────────────────

def navigate_to_write_page(driver: webdriver.Chrome, cafe_url: str, menu_id: str) -> bool:
    """카페 글쓰기 페이지로 이동"""
    try:
        # 카페 글쓰기 URL 직접 접근
        write_url = f"https://cafe.naver.com/ca-fe/cafes/{cafe_url}/articles/write?boardType=L&menuId={menu_id}"
        driver.get(write_url)
        random_delay(3, 5)

        # iframe 확인 (네이버 카페는 iframe 구조)
        try:
            driver.switch_to.frame("cafe_main")
            random_delay(1, 2)
        except Exception:
            pass  # iframe이 없을 수도 있음

        logger.info(f"글쓰기 페이지 이동 완료: {cafe_url}, menuId={menu_id}")
        return True

    except Exception as e:
        logger.error(f"글쓰기 페이지 이동 실패: {e}")
        return False


def write_post(
    driver: webdriver.Chrome,
    title: str,
    content: str,
    image_path: Optional[str] = None
) -> Optional[str]:
    """
    SE ONE 에디터에서 글 작성 후 발행
    Returns: 발행된 글 URL 또는 None
    """
    try:
        wait = WebDriverWait(driver, 15)

        # 제목 입력
        title_area = wait.until(EC.presence_of_element_located(
            (By.CSS_SELECTOR, ".se-ff-system.se-fs28.se-placeholder.__se_title")
        ))
        title_area.click()
        random_delay(0.3, 0.6)
        human_type(title_area, title)
        random_delay(0.5, 1.0)

        # 본문 영역으로 이동
        body_area = wait.until(EC.presence_of_element_located(
            (By.CSS_SELECTOR, ".se-component-content .se-text-paragraph")
        ))
        body_area.click()
        random_delay(0.3, 0.6)

        # 가운데 정렬 설정
        try:
            align_btn = driver.find_element(
                By.CSS_SELECTOR, ".se-toolbar-button[data-command='align']"
            )
            align_btn.click()
            random_delay(0.2, 0.4)
            center_option = driver.find_element(
                By.CSS_SELECTOR, "[data-value='center']"
            )
            center_option.click()
            random_delay(0.3, 0.5)
        except NoSuchElementException:
            logger.info("정렬 버튼을 찾을 수 없음, 기본 정렬 사용")

        # 본문 입력 (문단별)
        paragraphs = content.split("\n\n")
        for i, paragraph in enumerate(paragraphs):
            if paragraph.strip():
                human_type(body_area, paragraph.strip())
                if i < len(paragraphs) - 1:
                    body_area.send_keys(Keys.ENTER)
                    body_area.send_keys(Keys.ENTER)
                    random_delay(0.3, 0.8)

        random_delay(1, 2)

        # 이미지 삽입
        if image_path:
            try:
                image_btn = driver.find_element(
                    By.CSS_SELECTOR, ".se-toolbar-button[data-command='image']"
                )
                image_btn.click()
                random_delay(1, 2)

                file_input = driver.find_element(By.CSS_SELECTOR, "input[type='file']")
                file_input.send_keys(image_path)
                random_delay(3, 5)
                logger.info("이미지 삽입 완료")
            except Exception as e:
                logger.warning(f"이미지 삽입 실패: {e}")

        # 등록 버튼 클릭
        random_delay(1, 2)
        submit_btn = wait.until(EC.element_to_be_clickable(
            (By.CSS_SELECTOR, ".BaseButton.BaseButton--skinGreen.BaseButton--sizeM")
        ))
        submit_btn.click()
        random_delay(3, 5)

        # 발행 확인 - URL에서 articleId 확인
        current_url = driver.current_url
        if "articles" in current_url or "ArticleRead" in current_url:
            logger.info(f"글 발행 성공: {current_url}")
            return current_url

        # 확인 다이얼로그 처리
        try:
            confirm_btn = driver.find_element(
                By.CSS_SELECTOR, ".BaseButton.BaseButton--skinGreen"
            )
            confirm_btn.click()
            random_delay(3, 5)
            current_url = driver.current_url
            if "articles" in current_url:
                return current_url
        except NoSuchElementException:
            pass

        logger.warning(f"발행 후 URL 확인 실패: {current_url}")
        return None

    except TimeoutException as e:
        logger.error(f"글 작성 타임아웃: {e}")
        return None
    except Exception as e:
        logger.error(f"글 작성 중 오류: {e}")
        return None


# ─── 댓글 작성 ─────────────────────────────────────────────

def write_comment(driver: webdriver.Chrome, post_url: str, comment_text: str) -> bool:
    """게시글에 댓글 작성"""
    try:
        driver.get(post_url)
        random_delay(2, 4)

        # iframe 전환
        try:
            driver.switch_to.frame("cafe_main")
            random_delay(1, 2)
        except Exception:
            pass

        wait = WebDriverWait(driver, 10)

        # 댓글 입력 영역 클릭
        comment_area = wait.until(EC.presence_of_element_located(
            (By.CSS_SELECTOR, ".comment_inbox .comment_textarea textarea, "
                              ".CommentWriter .comment_inbox textarea")
        ))
        comment_area.click()
        random_delay(0.5, 1.0)

        # 댓글 입력
        human_type(comment_area, comment_text)
        random_delay(0.5, 1.5)

        # 등록 버튼 클릭
        submit_btn = driver.find_element(
            By.CSS_SELECTOR, ".comment_inbox .btn_register, .CommentWriter .btn_register"
        )
        submit_btn.click()
        random_delay(2, 3)

        logger.info(f"댓글 작성 성공: {comment_text[:20]}...")
        return True

    except Exception as e:
        logger.error(f"댓글 작성 실패: {e}")
        return False


# ─── 통합 발행 프로세스 ────────────────────────────────────

def publish_to_cafe(
    account: dict,
    cafe_url: str,
    menu_id: str,
    title: str,
    content: str,
    image_path: Optional[str] = None,
    headless: bool = True,
    on_progress=None
) -> dict:
    """
    전체 카페 글 발행 프로세스
    Returns: {"success": bool, "url": str|None, "error": str|None, "cookies": str|None}
    """
    driver = None
    result = {"success": False, "url": None, "error": None, "cookies": None}

    try:
        if on_progress:
            on_progress("driver", "브라우저 시작 중...")
        driver = create_driver(headless=headless)

        # 1. 로그인
        if on_progress:
            on_progress("login", "로그인 시도 중...")

        logged_in = False
        if account.get("cookie_data"):
            logged_in = login_with_cookie(driver, account["cookie_data"])

        if not logged_in:
            logged_in = login_with_credentials(
                driver, account["username"], account["password_enc"]
            )

        if not logged_in:
            result["error"] = "로그인 실패"
            return result

        # 쿠키 저장
        result["cookies"] = get_login_cookies(driver)

        # 2. 카페 글쓰기 페이지 이동
        if on_progress:
            on_progress("navigate", f"카페 이동 중... ({cafe_url})")

        if not navigate_to_write_page(driver, cafe_url, menu_id):
            result["error"] = "글쓰기 페이지 이동 실패"
            return result

        # 3. 글 작성 & 발행
        if on_progress:
            on_progress("writing", "글 작성 중...")

        published_url = write_post(driver, title, content, image_path)

        if published_url:
            result["success"] = True
            result["url"] = published_url
            if on_progress:
                on_progress("done", f"발행 완료: {published_url}")
        else:
            result["error"] = "글 발행 실패 (URL 확인 불가)"

        return result

    except Exception as e:
        result["error"] = str(e)
        logger.error(f"발행 프로세스 오류: {e}")
        return result

    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass


def post_comment(
    account: dict,
    post_url: str,
    comment_text: str,
    headless: bool = True
) -> dict:
    """
    댓글 작성 프로세스
    Returns: {"success": bool, "error": str|None, "cookies": str|None}
    """
    driver = None
    result = {"success": False, "error": None, "cookies": None}

    try:
        driver = create_driver(headless=headless)

        # 로그인
        logged_in = False
        if account.get("cookie_data"):
            logged_in = login_with_cookie(driver, account["cookie_data"])

        if not logged_in:
            logged_in = login_with_credentials(
                driver, account["username"], account["password_enc"]
            )

        if not logged_in:
            result["error"] = "로그인 실패"
            return result

        result["cookies"] = get_login_cookies(driver)

        # 댓글 작성
        success = write_comment(driver, post_url, comment_text)
        if success:
            result["success"] = True
        else:
            result["error"] = "댓글 작성 실패"

        return result

    except Exception as e:
        result["error"] = str(e)
        return result

    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass
