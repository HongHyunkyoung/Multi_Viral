from __future__ import annotations

import re
import time
import requests
from bs4 import BeautifulSoup

try:
    from newspaper import Article, Config
    HAS_NEWSPAPER = True
except ImportError:
    HAS_NEWSPAPER = False

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import NoTranscriptFound, TranscriptsDisabled

_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
}


def extract_content(url: str) -> tuple[str, str]:
    """Returns (source_type, content_text)."""
    if "youtube.com" in url or "youtu.be" in url:
        return "youtube", extract_youtube(url)
    if "blog.naver.com" in url:
        return "blog", extract_naver_blog(url)
    if "news.naver.com" in url or "n.news.naver.com" in url:
        return "blog", extract_naver_news(url)
    return "blog", extract_blog(url)


def extract_naver_blog(url: str) -> str:
    # blog.naver.com/userid/postno → m.blog.naver.com/userid/postno
    mobile_url = url.replace("://blog.naver.com", "://m.blog.naver.com")
    try:
        resp = requests.get(mobile_url, headers=_HEADERS, timeout=20)
        resp.raise_for_status()
    except Exception as e:
        raise ValueError("네이버 블로그를 가져올 수 없습니다.") from e

    soup = BeautifulSoup(resp.text, "html.parser")
    container = soup.find(class_="se-main-container") or soup.find(class_="post-view")
    if not container:
        raise ValueError("본문을 추출할 수 없는 페이지입니다.")

    text = container.get_text(separator="\n").strip()
    if len(text) < 100:
        raise ValueError("본문을 추출할 수 없는 페이지입니다.")
    return text[:4000]


def extract_naver_news(url: str) -> str:
    try:
        # 네이버 뉴스는 모바일 페이지가 추출이 더 쉬운 경우가 많음
        target_url = url
        if "news.naver.com" in url and "m.news.naver.com" not in url and "n.news.naver.com" not in url:
            target_url = url.replace("news.naver.com", "n.news.naver.com")

        resp = requests.get(target_url, headers=_HEADERS, timeout=20)
        resp.raise_for_status()
    except Exception:
        return extract_blog(url)

    soup = BeautifulSoup(resp.text, "html.parser")
    
    # 네이버 뉴스 주요 본문 컨테이너 (다양한 레이아웃 대응)
    container = (
        soup.select_one("#dic_area") or 
        soup.select_one("#articleBodyContents") or 
        soup.select_one("#articeBody") or
        soup.select_one("#newsct_article") or
        soup.select_one(".article_body") or
        soup.select_one(".news_end")
    )
    
    if not container:
        # 일반적인 newspaper3k로 폴백
        return extract_blog(url)

    # 불필요한 요소 제거 (광고, 기자정보, 관련뉴스, 비디오 레이어 등)
    for extra in container.select("""
        .end_photo_org, .ext_video_area, .footer_btn, .byline, 
        .guide_categorization, .copyright, .ad_area, .view_editor,
        script, style, iframe, .go_trans
    """):
        extra.decompose()

    text = container.get_text(separator="\n").strip()
    
    # 추출된 텍스트가 너무 적으면 newspaper3k 시도
    if len(text) < 100:
        fallback_text = extract_blog(url)
        # newspaper3k의 결과가 더 좋으면 그것을 반환
        if len(fallback_text) > len(text):
            return fallback_text
        
    return text[:4000]


import os

def extract_youtube(url: str) -> str:
    video_id_match = re.search(r"v=([^&]+)", url) or re.search(r"youtu\.be/([^?]+)", url)
    if not video_id_match:
        raise ValueError("올바른 YouTube URL이 아닙니다.")
    
    vid = video_id_match.group(1)
    
    # 1. RapidAPI 시도 (배포 환경 권장)
    api_key = os.getenv("RAPIDAPI_KEY")
    if api_key:
        rapid_url = "https://youtube-transcriptor.p.rapidapi.com/transcript"
        headers = {
            "x-rapidapi-key": api_key,
            "x-rapidapi-host": "youtube-transcriptor.p.rapidapi.com",
            "Content-Type": "application/json"
        }
        
        # 한국어 -> 영어 순으로 시도
        for lang in ["ko", "en"]:
            try:
                resp = requests.get(rapid_url, headers=headers, params={"video_id": vid, "lang": lang}, timeout=15)
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list) and len(data) > 0:
                        return " ".join(item.get("text", "") for item in data).strip()[:4000]
            except Exception:
                continue

    # 2. 기존 라이브러리 방식 (로컬 환경 또는 API 키 없을 때 폴백)
    proxy_url = os.getenv("YOUTUBE_PROXY")
    cookies_path = os.getenv("YOUTUBE_COOKIES_PATH")
    proxies = {"https": proxy_url} if proxy_url else None
    
    try:
        try:
            transcript = YouTubeTranscriptApi.get_transcript(vid, languages=["ko", "en"], proxies=proxies, cookies=cookies_path)
        except (NoTranscriptFound, TranscriptsDisabled, Exception):
            tlist = YouTubeTranscriptApi.list_transcripts(vid)
            try:
                transcript = tlist.find_transcript(['ko', 'en']).fetch()
            except Exception:
                transcript = next(iter(tlist)).fetch()
            
    except Exception as e:
        error_msg = str(e)
        if "blocking requests from your IP" in error_msg or "Too Many Requests" in error_msg:
             raise ValueError(
                 "유튜브에서 서버 IP를 차단했습니다. \n"
                 "1. Render 설정에서 RAPIDAPI_KEY를 설정하거나, \n"
                 "2. 서버 대신 로컬 환경에서 실행해 주세요."
             ) from e
        raise ValueError(f"자막을 가져올 수 없습니다: {error_msg}") from e

    return " ".join(t.get("text", "") for t in transcript).strip()[:4000]


def extract_blog(url: str) -> str:
    if not HAS_NEWSPAPER:
        return f"현재 환경에서 블로그 추출 라이브러리(newspaper3k)를 사용할 수 없습니다. URL: {url}"

    config = Config()
    config.browser_user_agent = _HEADERS["User-Agent"]
    config.request_timeout = 20  # 기본 7초에서 20초로 연장
    
    article = Article(url, config=config, language="ko")
    try:
        article.download()
        article.parse()
    except Exception as e:
        # 1회 재시도 (간혹 발생하는 일시적 타임아웃 대응)
        try:
            time.sleep(1)
            article.download()
            article.parse()
        except Exception:
            raise ValueError(f"블로그 콘텐츠를 가져올 수 없습니다: {str(e)}") from e
    
    text = (article.text or "").strip()
    if not text or len(text) < 100:
        raise ValueError("본문을 충분히 추출할 수 없는 페이지입니다. (최소 100자 이상 필요)")
    
    return text[:4000]
