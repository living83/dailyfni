from __future__ import annotations

import importlib
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _reload_base():
    """Reload scrapers.base + its config dependency after env mutation."""
    import config
    import scrapers.base as base
    importlib.reload(config)
    importlib.reload(base)
    return base


def test_proxy_disabled_returns_none(monkeypatch):
    monkeypatch.delenv("PROXY_ENABLED", raising=False)
    monkeypatch.setenv("PROXY_HOST", "")
    base = _reload_base()
    assert base._build_proxy_config() is None


def test_proxy_enabled_but_no_host_returns_none(monkeypatch):
    monkeypatch.setenv("PROXY_ENABLED", "true")
    monkeypatch.setenv("PROXY_HOST", "")
    base = _reload_base()
    assert base._build_proxy_config() is None


def test_proxy_strips_http_prefix(monkeypatch):
    monkeypatch.setenv("PROXY_ENABLED", "true")
    monkeypatch.setenv("PROXY_HOST", "http://isp.decodo.com")
    monkeypatch.setenv("PROXY_PORT_START", "10001")
    monkeypatch.setenv("PROXY_PORT_END", "10001")
    monkeypatch.setenv("PROXY_USER", "u")
    monkeypatch.setenv("PROXY_PASS", "p")
    base = _reload_base()
    cfg = base._build_proxy_config()
    assert cfg == {
        "server": "http://isp.decodo.com:10001",
        "username": "u",
        "password": "p",
    }


def test_proxy_port_in_range(monkeypatch):
    monkeypatch.setenv("PROXY_ENABLED", "1")
    monkeypatch.setenv("PROXY_HOST", "isp.decodo.com")
    monkeypatch.setenv("PROXY_PORT_START", "10001")
    monkeypatch.setenv("PROXY_PORT_END", "10010")
    monkeypatch.setenv("PROXY_USER", "")
    monkeypatch.setenv("PROXY_PASS", "")
    base = _reload_base()
    seen_ports = set()
    for _ in range(50):
        cfg = base._build_proxy_config()
        port = int(cfg["server"].rsplit(":", 1)[-1])
        assert 10001 <= port <= 10010
        seen_ports.add(port)
        # Auth fields should be absent when creds not provided
        assert "username" not in cfg
        assert "password" not in cfg
    # 50 draws over 10 ports should hit at least a few distinct values
    assert len(seen_ports) >= 3, f"port rotation looks broken: only saw {seen_ports}"


def test_disabled_via_falsy_value(monkeypatch):
    monkeypatch.setenv("PROXY_ENABLED", "false")
    monkeypatch.setenv("PROXY_HOST", "isp.decodo.com")
    base = _reload_base()
    assert base._build_proxy_config() is None
