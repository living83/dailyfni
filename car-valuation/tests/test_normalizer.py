from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from normalizer import ModelNormalizer, canonical_form  # noqa: E402


@pytest.fixture
def fixture_json(tmp_path: Path) -> Path:
    data = {
        "K7": {
            "aliases": ["K7", "기아 K7", "더 뉴 K7", "케이세븐"],
            "encar": {"ModelGroup": "K7"},
            "kbchachacha": {"makerCode": "102", "classCode": "1173"},
            "heydealer": {"brand_hash_id": "2oV0gK", "model_group_hash_id": "XevRae"},
        },
        "포터2": {
            "aliases": ["포터Ⅱ", "포터II", "포터 II", "PORTER", "PORTERⅡ", "현대 포터"],
            "encar": {"ModelGroup": "포터2"},
            "kbchachacha": {"makerCode": "101", "classCode": "9999"},
            "heydealer": {"brand_hash_id": "xoKegB", "model_group_hash_id": "TBD"},
        },
    }
    p = tmp_path / "norm.json"
    p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return p


def test_canonical_form_basics():
    assert canonical_form("K7") == "k7"
    assert canonical_form(" K7 ") == "k7"
    assert canonical_form("k7") == "k7"
    assert canonical_form("기아 K7") == "기아k7"
    # NFKC unifies full-width Roman: Ⅱ → II → 2
    assert canonical_form("포터Ⅱ") == "포터2"
    assert canonical_form("포터II") == "포터2"
    # Parenthesized clarifier removed
    assert canonical_form("포터Ⅱ (PORTERⅡ)") == "포터2"
    # Dashes/dots stripped
    assert canonical_form("K-7") == "k7"


def test_exact_alias_hit(fixture_json: Path):
    n = ModelNormalizer(fixture_json)
    canonical, score = n.normalize("K7")
    assert canonical == "K7"
    assert score == 100.0


def test_alias_case_and_space_invariant(fixture_json: Path):
    n = ModelNormalizer(fixture_json)
    for variant in [" K7 ", "k7", "K7", "K-7", "기아 K7", "기아K7"]:
        canonical, score = n.normalize(variant)
        assert canonical == "K7", f"failed for {variant!r}: got {canonical}"
        assert score == 100.0


def test_roman_numeral_porter(fixture_json: Path):
    n = ModelNormalizer(fixture_json)
    for variant in ["포터Ⅱ", "포터 II", "포터II", "포터Ⅱ (PORTERⅡ)", "PORTERⅡ"]:
        canonical, _ = n.normalize(variant)
        assert canonical == "포터2", f"failed for {variant!r}: got {canonical}"


def test_fuzzy_threshold_gates(fixture_json: Path):
    n = ModelNormalizer(fixture_json)
    # Junk input should not match
    canonical, _score = n.normalize("완전히 다른 차종이름ABC")
    assert canonical is None


def test_unknown_model_returns_none(fixture_json: Path):
    n = ModelNormalizer(fixture_json)
    canonical, _ = n.normalize("스팅어")
    assert canonical is None


def test_site_codes_lookup(fixture_json: Path):
    n = ModelNormalizer(fixture_json)
    encar = n.site_codes("K7", "encar")
    assert encar == {"ModelGroup": "K7"}
    kb = n.site_codes("K7", "kbchachacha")
    assert kb == {"makerCode": "102", "classCode": "1173"}
    hd = n.site_codes("K7", "heydealer")
    assert hd["brand_hash_id"] == "2oV0gK"
    # Unknown site
    assert n.site_codes("K7", "missing_site") is None
    # Unknown canonical
    assert n.site_codes("UnknownModel", "encar") is None


def test_resolve_one_shot(fixture_json: Path):
    n = ModelNormalizer(fixture_json)
    canonical, codes, score = n.resolve("기아 K7", "kbchachacha")
    assert canonical == "K7"
    assert codes == {"makerCode": "102", "classCode": "1173"}
    assert score == 100.0


def test_default_normalizer_loads_real_file():
    # Smoke test the real data file ships with K7 fully populated
    n = ModelNormalizer()
    canonical, score = n.normalize("K7")
    assert canonical == "K7"
    assert score == 100.0
    for site in ("encar", "kbchachacha", "heydealer"):
        codes = n.site_codes("K7", site)
        assert codes is not None, f"K7 missing {site} codes"
