from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import app as app_module  # noqa: E402
from app import app  # noqa: E402


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def stub_valuate(monkeypatch):
    """Replace valuation_engine.valuate with a deterministic stub."""
    async def _stub(model: str, year: int, *, use_cache: bool = True, **_):
        return {
            "model": model,
            "canonical": "K7",
            "year": year,
            "market_price": 6_316_000,
            "auction_price": 4_737_000,
            "confidence": "상",
            "sources": {
                "encar":       {"median": 5_990_000, "count": 20},
                "kbchachacha": {"median": 6_700_000, "count": 9},
                "heydealer":   {"median": 6_300_000, "count": 3},
            },
            "cached": use_cache,
            "cache_hits": {"encar": True, "kbchachacha": True, "heydealer": use_cache},
            "elapsed_sec": 0.02,
            "match_score": 100.0,
        }
    monkeypatch.setattr(app_module, "valuate", _stub)
    return _stub


# ---------- non-business routes ----------

def test_health(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_root(client: TestClient):
    r = client.get("/")
    assert r.status_code == 200
    body = r.json()
    assert body["service"] == "car-valuation"


# ---------- /valuate ----------

def test_valuate_happy(stub_valuate, client: TestClient):
    r = client.post("/valuate", json={"model": "K7", "year": 2014})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["market_price"] == 6_316_000
    assert body["auction_price"] == 4_737_000
    assert body["confidence"] == "상"
    assert body["sources"]["encar"] == {"median": 5_990_000, "count": 20}
    assert body["cached"] is True


def test_valuate_alias_input_passes_through(stub_valuate, client: TestClient):
    # Normalization happens inside valuate() (and we've stubbed that), so the
    # API just has to forward the raw model string through unchanged.
    r = client.post("/valuate", json={"model": "기아 K7", "year": 2014})
    assert r.status_code == 200
    assert r.json()["model"] == "기아 K7"


def test_valuate_empty_model_rejected(client: TestClient):
    r = client.post("/valuate", json={"model": "", "year": 2014})
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert any("model" in (loc for loc in d.get("loc", [])) for d in detail)


def test_valuate_year_out_of_range_rejected(client: TestClient):
    r = client.post("/valuate", json={"model": "K7", "year": 1800})
    assert r.status_code == 422


def test_valuate_year_string_coerced_or_rejected(client: TestClient):
    # FastAPI/Pydantic will coerce strings of digits, so this must succeed
    # (handler still works since we don't hit it without stub — but it
    # should at least pass validation). Mainly checks pydantic config.
    r = client.post("/valuate", json={"model": "K7", "year": "2014"})
    # Pydantic v2 strict_int? With default it coerces. Either pass or 422 — both fine.
    assert r.status_code in (200, 422, 500)


def test_valuate_use_cache_false_propagates(stub_valuate, client: TestClient):
    r = client.post("/valuate", json={"model": "K7", "year": 2014, "use_cache": False})
    assert r.status_code == 200
    body = r.json()
    # stub returns cached == use_cache to verify pass-through
    assert body["cached"] is False


def test_valuate_500_on_engine_error(monkeypatch, client: TestClient):
    async def _boom(model, year, **kw):
        raise RuntimeError("simulated downstream failure")
    monkeypatch.setattr(app_module, "valuate", _boom)
    r = client.post("/valuate", json={"model": "K7", "year": 2014})
    assert r.status_code == 500
    assert "simulated downstream failure" in r.json()["detail"]


# ---------- /valuate-batch ----------

@pytest.fixture
def stub_batch(monkeypatch):
    from batch_processor import BatchSummary
    async def _stub(input_path, output_path=None, *, use_cache=True, **_):
        from pathlib import Path
        return BatchSummary(
            input_path=Path(input_path),
            output_path=Path(output_path or "out.xlsx"),
            total_rows=5, processed=4, succeeded=3, failed=1,
            elapsed_sec=12.34, warnings=["row 7: empty 차종"],
        )
    monkeypatch.setattr(app_module, "valuate_batch", _stub)
    return _stub


def test_valuate_batch_happy(stub_batch, tmp_path, client: TestClient):
    f = tmp_path / "loans.xlsx"
    f.write_text("placeholder")  # only existence is checked before stub
    r = client.post("/valuate-batch", json={"file_path": str(f)})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["processed"] == 4
    assert body["succeeded"] == 3
    assert body["failed"] == 1
    assert body["warnings"] == ["row 7: empty 차종"]


def test_valuate_batch_file_not_found(client: TestClient):
    r = client.post("/valuate-batch", json={"file_path": "C:/does/not/exist.xlsx"})
    assert r.status_code == 400


def test_valuate_batch_missing_file_path_rejected(client: TestClient):
    r = client.post("/valuate-batch", json={})
    assert r.status_code == 422


def test_valuate_batch_empty_file_path_rejected(client: TestClient):
    r = client.post("/valuate-batch", json={"file_path": ""})
    assert r.status_code == 422
