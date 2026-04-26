from __future__ import annotations

import hashlib
import time
from typing import Any, TypedDict

DEFAULT_TTL_SECONDS = 3600  # 1 hour


class CachedResult(TypedDict):
    value: dict[str, Any]
    created_at: float
    ttl: int


cache_store: dict[str, CachedResult] = {}


def make_cache_key(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()


def is_expired(item: CachedResult, now: float | None = None) -> bool:
    current = time.time() if now is None else now
    return (current - item["created_at"]) > float(item["ttl"])


def get_cache(cache_key: str) -> dict[str, Any] | None:
    item = cache_store.get(cache_key)
    if not item:
        return None
    if is_expired(item):
        cache_store.pop(cache_key, None)
        return None
    return item["value"]


def set_cache(cache_key: str, value: dict[str, Any], ttl: int = DEFAULT_TTL_SECONDS) -> None:
    item: CachedResult = {
        "value": value,
        "created_at": time.time(),
        "ttl": int(ttl),
    }
    cache_store[cache_key] = item


# Backward-compatible helpers (url -> sha256 key)
def get(url: str) -> dict[str, Any] | None:
    return get_cache(make_cache_key(url))


def set(url: str, value: dict[str, Any], ttl: int = DEFAULT_TTL_SECONDS) -> None:
    set_cache(make_cache_key(url), value, ttl=ttl)


def clear() -> None:
    cache_store.clear()


def prune_expired() -> int:
    now = time.time()
    expired_keys = [k for k, v in cache_store.items() if is_expired(v, now)]
    for k in expired_keys:
        cache_store.pop(k, None)
    return len(expired_keys)
