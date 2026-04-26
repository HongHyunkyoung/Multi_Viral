from __future__ import annotations

import hashlib
import time
from pathlib import Path

from dotenv import load_dotenv

# chains 모듈 import 전에 .env 로드 (Anthropic 클라이언트 초기화 시점에 키 필요)
load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from cache import clear as cache_clear
from cache import get_cache
from cache import prune_expired
from cache import set_cache
from cache import cache_store
from chains import run_chain
from extractor import extract_content

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    url: str


@app.get("/api/health")
def health() -> dict:
    prune_expired()
    return {"status": "ok", "cache_size": len(cache_store)}


@app.post("/api/generate")
def generate(payload: GenerateRequest) -> dict:
    started = time.time()
    url = payload.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail={"error": "INVALID_URL", "message": "URL이 비어있습니다."})

    url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]

    prune_expired()
    cached = get_cache(url_hash)
    if cached:
        cached["cache_hit"] = True
        cached["processing_time_ms"] = int((time.time() - started) * 1000)
        return cached

    try:
        source_type, raw_content = extract_content(url)
    except ValueError as e:
        raise HTTPException(status_code=422, detail={"error": "EXTRACTION_FAILED", "message": str(e)}) from e
    except Exception as e:
        raise HTTPException(
            status_code=500, detail={"error": "EXTRACTION_FAILED", "message": "콘텐츠를 가져올 수 없습니다."}
        ) from e

    try:
        chain_result = run_chain(raw_content)
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": "CLAUDE_FAILED", "message": str(e)}) from e

    platform_posts = chain_result["platform_posts"]

    response = {
        "cache_hit": False,
        "source_type": source_type,
        "title": "",
        "platform_posts": platform_posts,
        "processing_time_ms": int((time.time() - started) * 1000),
    }

    set_cache(url_hash, response)
    return response


@app.delete("/api/cache")
def delete_cache() -> dict:
    cache_clear()
    return {"status": "ok", "cache_size": 0}
