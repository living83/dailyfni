"""Normalize raw input car-model strings to canonical names + per-site codes.

The NPL loan ledger lists models inconsistently ("포터Ⅱ (PORTERⅡ)", "BMW 520d",
"기아 K7", "K7" all referring to one of two canonical models). Each site
(encar, kbchachacha, heydealer) uses its own representation. This module
collapses both ends into a single lookup table.
"""
from __future__ import annotations

import json
import logging
import re
import threading
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from rapidfuzz import fuzz, process

from config import DATA_DIR, FUZZY_MATCH_THRESHOLD, LOGS_DIR

logger = logging.getLogger(__name__)

DEFAULT_PATH = DATA_DIR / "model_normalizer.json"
UNMATCHED_LOG = LOGS_DIR / "unmatched_models.log"

# Roman → Arabic substitutions (applied after NFKC, which turns Ⅱ→II etc.).
# `\b` is Unicode-aware so it would NOT separate Korean+Latin (`터` and `I` are
# both \w), which leaves "포터II" unmatched. Use ASCII-letter/digit lookarounds
# instead so the substitution fires inside mixed-script tokens.
# Single-letter Romans (I, V, X) are dropped — too many false positives (e.g.
# "BMW i3", "G70 V" trim grade).
_ROMAN_MAP: dict[str, str] = {
    "VIII": "8", "VII": "7", "VI": "6", "IX": "9",
    "IV": "4", "III": "3", "II": "2",
}
_ROMAN_PATTERN = re.compile(
    r"(?<![A-Z0-9])(VIII|VII|VI|IX|IV|III|II)(?![A-Z0-9])"
)


def canonical_form(raw: str) -> str:
    """Reduce a model string to a comparison-friendly form."""
    if not raw:
        return ""
    s = unicodedata.normalize("NFKC", raw)
    # Drop parenthetical clarifiers: "포터Ⅱ (PORTERⅡ)" → "포터Ⅱ "
    s = re.sub(r"[(（][^)）]*[)）]", "", s)
    s = s.upper()  # cap before Roman replace (patterns are uppercase)
    s = _ROMAN_PATTERN.sub(lambda m: _ROMAN_MAP[m.group(1)], s)
    # Collapse all whitespace + drop punctuation we don't care about
    s = re.sub(r"[\s\-_,./]+", "", s)
    return s.lower()


class ModelNormalizer:
    def __init__(self, path: Path | str | None = None) -> None:
        self._path = Path(path) if path else DEFAULT_PATH
        self._data: dict[str, dict[str, Any]] = json.loads(
            self._path.read_text(encoding="utf-8")
        )
        self._alias_to_canonical: dict[str, str] = {}
        for canonical, info in self._data.items():
            forms = [canonical, *info.get("aliases", [])]
            for f in forms:
                cf = canonical_form(f)
                if cf:
                    self._alias_to_canonical[cf] = canonical

    @property
    def canonicals(self) -> list[str]:
        return list(self._data.keys())

    def normalize(
        self, raw: str, *, threshold: int | None = None
    ) -> tuple[str | None, float]:
        """Return (canonical_name, score) or (None, score) if no acceptable match."""
        if not raw:
            return None, 0.0
        thr = FUZZY_MATCH_THRESHOLD if threshold is None else threshold
        cf = canonical_form(raw)
        # 1) exact alias hit
        if cf in self._alias_to_canonical:
            return self._alias_to_canonical[cf], 100.0
        # 2) fuzzy fallback over all alias forms
        match = process.extractOne(
            cf, list(self._alias_to_canonical.keys()), scorer=fuzz.WRatio
        )
        if match is None:
            return None, 0.0
        choice, score, _ = match
        if score >= thr:
            return self._alias_to_canonical[choice], score
        return None, score

    def site_codes(self, canonical: str, site: str) -> dict[str, Any] | None:
        info = self._data.get(canonical)
        if not info:
            return None
        return info.get(site)

    def resolve(
        self, raw: str, site: str
    ) -> tuple[str | None, dict[str, Any] | None, float]:
        """One-shot: raw → canonical + that site's codes + score."""
        canonical, score = self.normalize(raw)
        if canonical is None:
            return None, None, score
        return canonical, self.site_codes(canonical, site), score


_lock = threading.Lock()
_default_singleton: ModelNormalizer | None = None


def get_default() -> ModelNormalizer:
    global _default_singleton
    with _lock:
        if _default_singleton is None:
            _default_singleton = ModelNormalizer()
        return _default_singleton


def log_unmatched_to_file(
    raw_input: str,
    site: str,
    best_guess: str | None = None,
    score: float | None = None,
) -> None:
    """Append a single line to logs/unmatched_models.log for human review."""
    UNMATCHED_LOG.parent.mkdir(parents=True, exist_ok=True)
    line = (
        f"{datetime.now(timezone.utc).isoformat(timespec='seconds')}\t{site}\t"
        f"{raw_input!r}\tbest_guess={best_guess!r}\tscore={score}\n"
    )
    try:
        with UNMATCHED_LOG.open("a", encoding="utf-8") as f:
            f.write(line)
    except OSError as e:
        logger.warning("could not write unmatched log: %s", e)
