from __future__ import annotations

import logging
import re
from typing import Any

from normalizer import ModelNormalizer, get_default, log_unmatched_to_file
from scrapers.base import BaseScraper
from scrapers.utils import (
    ScraperBlocked,
    ScraperEmpty,
    human_delay,
    median_int,
)

logger = logging.getLogger(__name__)

KB_MAIN = "https://www.kbchachacha.com/public/search/main.kbc"
KB_LIST = "https://www.kbchachacha.com/public/search/list.empty"

CARD_SPLIT = re.compile(r'<div class="area\s*"\s+data-car-seq="\d+">')
TITLE_PATTERN = re.compile(r'<strong class="tit">\s*(.+?)\s*</strong>', re.DOTALL)
YEAR_PATTERN = re.compile(r"(\d{2})/(\d{2})식")
PRICE_PATTERN = re.compile(r'<span class="price"\s*>\s*([\d,]+)\s*<', re.DOTALL)

MIN_PRICE_KRW = 500_000
MAX_PRICE_KRW = 500_000_000
MAX_PAGES = 8
TARGET_SAMPLES = 20


def _two_digit_year_to_full(yy: int) -> int:
    return 2000 + yy if yy < 70 else 1900 + yy


def _parse_card(card_html: str) -> dict[str, Any] | None:
    title = TITLE_PATTERN.search(card_html)
    year_m = YEAR_PATTERN.search(card_html)
    price_m = PRICE_PATTERN.search(card_html)
    if not (title and year_m and price_m):
        return None
    try:
        manwon = int(price_m.group(1).replace(",", ""))
    except ValueError:
        return None
    return {
        "title": re.sub(r"\s+", " ", title.group(1)).strip(),
        "year": _two_digit_year_to_full(int(year_m.group(1))),
        "price_krw": manwon * 10_000,
    }


class KbChachachaScraper(BaseScraper):
    site_name = "kbchachacha"

    def __init__(self, headless: bool = True, normalizer: ModelNormalizer | None = None) -> None:
        super().__init__(headless=headless)
        self._normalizer = normalizer or get_default()

    async def _warm_session(self) -> None:
        page = await self.context.new_page()
        try:
            await page.goto(KB_MAIN, wait_until="domcontentloaded", timeout=30_000)
            await human_delay(1.0, 2.5)
        finally:
            await page.close()

    async def fetch_price(self, model: str, year: int) -> dict[str, Any]:
        canonical, codes, score = self._normalizer.resolve(model, self.site_name)
        if canonical is None or codes is None:
            log_unmatched_to_file(model, self.site_name, best_guess=None, score=score)
            raise ScraperEmpty(
                f"kbchachacha: model={model!r} not in normalizer (best_score={score:.0f})"
            )
        maker_code = codes.get("makerCode")
        class_code = codes.get("classCode")
        if not (maker_code and class_code):
            raise ScraperEmpty(
                f"kbchachacha: normalizer entry for {canonical!r} missing makerCode/classCode"
            )

        await self._warm_session()

        page = await self.context.new_page()
        all_prices: list[int] = []
        total_scanned = 0
        try:
            for page_num in range(1, MAX_PAGES + 1):
                if all_prices and len(all_prices) >= TARGET_SAMPLES:
                    break
                await human_delay()
                url = (
                    f"{KB_LIST}?makerCode={maker_code}&classCode={class_code}"
                    f"&page={page_num}"
                )
                response = await page.goto(url, wait_until="domcontentloaded", timeout=45_000)
                if response is None:
                    raise ScraperBlocked("kbchachacha: no response")
                if response.status == 429:
                    raise ScraperBlocked("kbchachacha: 429")
                if response.status >= 400:
                    raise ScraperBlocked(f"kbchachacha: HTTP {response.status}")

                try:
                    await page.wait_for_selector(
                        ".area[data-car-seq], .empty-box02", timeout=10_000
                    )
                except Exception:
                    pass

                html = await page.content()
                if "captcha" in html.lower():
                    raise ScraperBlocked("kbchachacha: captcha page")

                # Empty-result marker
                if "empty-box02" in html and 'data-car-seq=' not in html:
                    break

                chunks = CARD_SPLIT.split(html)
                page_cards = 0
                page_matched = 0
                for chunk in chunks[1:]:
                    parsed = _parse_card(chunk)
                    if parsed is None:
                        continue
                    page_cards += 1
                    if parsed["year"] != year:
                        continue
                    if not (MIN_PRICE_KRW <= parsed["price_krw"] <= MAX_PRICE_KRW):
                        continue
                    all_prices.append(parsed["price_krw"])
                    page_matched += 1
                total_scanned += page_cards
                logger.debug(
                    "kb page %d: scanned %d cards, matched %d for year=%d",
                    page_num, page_cards, page_matched, year,
                )
                if page_cards == 0:
                    break  # end of results
        finally:
            await page.close()

        if not all_prices:
            raise ScraperEmpty(
                f"kbchachacha: 0 listings for model={model!r} year={year} "
                f"after scanning {total_scanned} cards"
            )

        samples = all_prices[:TARGET_SAMPLES]
        return {
            "site": self.site_name,
            "median": median_int(samples),
            "count": len(samples),
            "samples": samples,
            "raw_total": total_scanned,
        }
