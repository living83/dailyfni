from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

import pytest
from openpyxl import Workbook

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from excel_loader import (  # noqa: E402
    _parse_year,
    detect_header_row,
    load_loans,
    map_columns,
)


def _make_xlsx(tmp_path: Path, rows: list[list]) -> Path:
    wb = Workbook()
    ws = wb.active
    for row in rows:
        ws.append(row)
    p = tmp_path / "test.xlsx"
    wb.save(p)
    return p


# ---------- _parse_year ----------

@pytest.mark.parametrize("value,expected", [
    (2014, 2014),
    ("2014", 2014),
    ("2014년식", 2014),
    ("2014.05", 2014),
    (14, 2014),         # 2-digit int < 70 → 20YY
    ("14", 2014),
    ("14년", 2014),
    (None, None),
    ("", None),
    ("이건연식이아님", None),
    (datetime(2018, 6, 1), 2018),
])
def test_parse_year(value, expected):
    assert _parse_year(value) == expected


# ---------- map_columns ----------

def test_map_columns_exact_aliases():
    m = map_columns(["채권번호", "차종", "연식", "차량번호", "미상환원금잔액"])
    assert m["model"] == 1
    assert m["year"] == 2
    assert m["plate"] == 3


def test_map_columns_fuzzy_match():
    # "차량 연식" should fuzzy-match "연식"
    m = map_columns(["담보종류", "차량명", "차량연식", "원금"])
    assert m["model"] == 1
    assert m["year"] == 2


def test_map_columns_override_pins_explicit_column():
    headers = ["A", "B", "C", "D"]
    m = map_columns(headers, overrides={"model": "C"})
    assert m["model"] == 2


def test_map_columns_no_match_omits_key():
    m = map_columns(["foo", "bar", "baz"])
    assert "model" not in m
    assert "year" not in m


# ---------- detect_header_row ----------

def test_header_row_detection_skips_title_row():
    rows = [
        ["NPL 채권 리스트 2026 Q2 (내부용)", None, None, None],
        ["채권번호", "차종", "연식", "잔액"],
        ["A001", "K7", 2014, 8_000_000],
    ]
    assert detect_header_row(rows) == 1


def test_header_row_detection_first_row_wins_when_clear():
    rows = [["차종", "연식"], ["K7", 2014]]
    assert detect_header_row(rows) == 0


# ---------- load_loans ----------

def test_load_loans_happy_path(tmp_path: Path):
    p = _make_xlsx(tmp_path, [
        ["채권번호", "담보종류", "차종", "연식", "차량번호", "미상환원금잔액"],
        ["A001", "자동차", "K7", 2014, "12가3456", 8_000_000],
        ["A002", "자동차", "쏘나타", "2018년식", "34나5678", 12_000_000],
    ])
    loans, warnings = load_loans(p)
    assert warnings == []
    assert len(loans) == 2
    assert loans[0].row_idx == 2  # 1-based; row 1 is header
    assert loans[0].model == "K7"
    assert loans[0].year == 2014
    assert loans[0].plate == "12가3456"
    assert loans[1].model == "쏘나타"
    assert loans[1].year == 2018
    # raw preserves all original columns
    assert loans[0].raw["채권번호"] == "A001"
    assert loans[0].raw["미상환원금잔액"] == 8_000_000


def test_load_loans_skips_blank_and_invalid_rows(tmp_path: Path):
    p = _make_xlsx(tmp_path, [
        ["차종", "연식"],
        ["K7", 2014],
        [None, None],            # blank
        ["", 2015],              # empty model
        ["BMW 520d", "데이터없음"],   # unparseable year
        ["쏘나타", 2018],
    ])
    loans, warnings = load_loans(p)
    assert len(loans) == 2
    assert [l.model for l in loans] == ["K7", "쏘나타"]
    # warnings should mention the bad rows
    assert any("empty 차종" in w for w in warnings)
    assert any("unparseable 연식" in w for w in warnings)


def test_load_loans_raises_when_required_columns_missing(tmp_path: Path):
    p = _make_xlsx(tmp_path, [
        ["채권번호", "담보종류", "원금"],
        ["A001", "자동차", 8_000_000],
    ])
    with pytest.raises(ValueError, match="required column"):
        load_loans(p)


def test_load_loans_missing_file_raises(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        load_loans(tmp_path / "nope.xlsx")


def test_load_loans_title_row_above_header(tmp_path: Path):
    p = _make_xlsx(tmp_path, [
        ["2026년 NPL 채권 리스트 (인쇄용)", None, None, None],
        ["채권번호", "차종", "연식", "차량번호"],
        ["A001", "K7", 2014, "12가3456"],
    ])
    loans, warnings = load_loans(p)
    assert len(loans) == 1
    assert loans[0].row_idx == 3
    assert loans[0].model == "K7"
