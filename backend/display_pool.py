"""
Xvfb 디스플레이 번호 풀.

같은 pm2 프로세스에서 pyautogui 로그인을 동시에 N개 띄울 수 있도록
디스플레이 번호 슬롯을 큐로 관리한다. 슬롯이 모자라면 acquire가 대기 →
자연스럽게 동시성 한계가 풀 capacity로 정해진다.

번호 자체는 자식 subprocess가 직접 Xvfb를 그 번호로 띄우는 데 쓰인다.
부모 프로세스는 os.environ['DISPLAY']를 건드리지 않는다.
"""

from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator, Optional


_pool: Optional["DisplayPool"] = None


class DisplayPool:
    def __init__(self, capacity: int, base: int):
        if capacity <= 0:
            raise ValueError("capacity must be > 0")
        self.capacity = capacity
        self.base = base
        self._available: "asyncio.Queue[int]" = asyncio.Queue()
        for n in range(base, base + capacity):
            self._available.put_nowait(n)

    @asynccontextmanager
    async def acquire(self) -> AsyncIterator[int]:
        num = await self._available.get()
        try:
            yield num
        finally:
            self._available.put_nowait(num)

    def free_slots(self) -> int:
        return self._available.qsize()


def get_display_pool() -> DisplayPool:
    global _pool
    if _pool is None:
        capacity = int(os.environ.get("CAFE_DISPLAY_POOL_SIZE", "4"))
        base = int(os.environ.get("CAFE_DISPLAY_BASE", "99"))
        _pool = DisplayPool(capacity=capacity, base=base)
    return _pool
