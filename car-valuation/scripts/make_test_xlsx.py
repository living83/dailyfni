"""Build a small synthetic NPL ledger for e2e testing.

Writes data/test_loans.xlsx with a mix of:
  - K7 in the canonical form
  - K7 alias inputs (should normalize to K7)
  - an unmatched model (should grade as 실패)
"""
from __future__ import annotations

import sys
from pathlib import Path

from openpyxl import Workbook

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

OUT = ROOT / "data" / "test_loans.xlsx"


HEADERS = ["채권번호", "담보종류", "차종", "연식", "차량번호", "미상환원금잔액"]

ROWS = [
    ["A001", "자동차", "K7",          2014, "12가3456", 8_000_000],
    ["A002", "자동차", "기아 K7",      2014, "34나5678", 7_500_000],   # alias of A001
    ["A003", "자동차", "더 뉴 K7",     2014, "56다7890", 7_200_000],   # alias of A001
    ["A004", "자동차", "케이세븐",     2014, "78라1234", 6_800_000],   # alias of A001
    ["A005", "자동차", "BMW 520d",    2018, "98마1234", 22_000_000], # unmatched (no normalizer entry yet)
    ["A006", "자동차", "완전허구차종", 2010, "10바5678", 5_000_000],   # unmatched
]


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    wb = Workbook()
    ws = wb.active
    ws.title = "loans"
    ws.append(HEADERS)
    for row in ROWS:
        ws.append(row)
    wb.save(OUT)
    print(f"wrote {OUT} ({len(ROWS)} data rows)")


if __name__ == "__main__":
    main()
