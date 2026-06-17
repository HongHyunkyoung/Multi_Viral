from __future__ import annotations

import hashlib
import os
import time
import logging
from pathlib import Path

from dotenv import load_dotenv

# .env 로드 (파일이 없어도 에러나지 않음)
load_dotenv()

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from cache import clear as cache_clear
from cache import get_cache
from cache import prune_expired
from cache import set_cache
from cache import cache_store
from chains import run_chain
from extractor import extract_content

# 로깅 설정 (Render 로그에서 확인 가능)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# CORS 설정
_raw = os.getenv("ALLOWED_ORIGINS", "*")  # 기본값을 *로 설정하여 배포 시 편의성 제공
if _raw == "*":
    _origins = ["*"]
else:
    _origins = [o.strip() for o in _raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True if _origins != ["*"] else False, # *일 때는 True 불가
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
def generate(payload: GenerateRequest, request: Request) -> dict:
    started = time.time()
    url = payload.url.strip()
    
    logger.info(f"Generate request for URL: {url}")

    if not url:
        raise HTTPException(status_code=400, detail={"error": "INVALID_URL", "message": "URL이 비어있습니다."})

    url_hash = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]

    prune_expired()
    cached = get_cache(url_hash)
    if cached:
        logger.info(f"Cache hit for {url_hash}")
        cached["cache_hit"] = True
        cached["processing_time_ms"] = int((time.time() - started) * 1000)
        return cached

    try:
        logger.info(f"Extracting content from {url}")
        source_type, raw_content = extract_content(url)
    except ValueError as e:
        logger.warning(f"Extraction failed: {str(e)}")
        raise HTTPException(status_code=422, detail={"error": "EXTRACTION_FAILED", "message": str(e)}) from e
    except Exception as e:
        logger.error(f"Unexpected extraction error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500, detail={"error": "EXTRACTION_FAILED", "message": "콘텐츠를 가져올 수 없습니다."}
        ) from e

    if not raw_content or not raw_content.strip():
        raise HTTPException(status_code=422, detail={"error": "EXTRACTION_FAILED", "message": "콘텐츠를 추출할 수 없습니다. 자막이 없거나 비공개 영상일 수 있습니다."})

    try:
        logger.info(f"Running Gemini chain for content (length: {len(raw_content)})")
        chain_result = run_chain(raw_content)
    except Exception as e:
        logger.error(f"Gemini chain failed: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail={"error": "GEMINI_FAILED", "message": str(e)}) from e

    platform_posts = chain_result["platform_posts"]
    title = chain_result.get("title", "") or ""

    response = {
        "cache_hit": False,
        "source_type": source_type,
        "title": title,
        "platform_posts": platform_posts,
        "processing_time_ms": int((time.time() - started) * 1000),
    }

    set_cache(url_hash, response)
    logger.info(f"Generation successful for {url_hash}")
    return response


@app.delete("/api/cache")
def delete_cache() -> dict:
    cache_clear()
    return {"status": "ok", "cache_size": 0}
