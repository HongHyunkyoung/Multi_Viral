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
try:
    from youtube_transcript_api._errors import NoTranscriptFound, TranscriptsDisabled
except ImportError:
    NoTranscriptFound = Exception
    TranscriptsDisabled = Exception

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

    # 모바일 URL 시도 → 실패 시 원본 URL 시도
    html = None
    for try_url in [mobile_url, url]:
        try:
            resp = requests.get(try_url, headers=_HEADERS, timeout=20)
            resp.raise_for_status()
            html = resp.text
            break
        except Exception:
            continue

    if not html:
        raise ValueError("네이버 블로그를 가져올 수 없습니다.")

    soup = BeautifulSoup(html, "html.parser")

    # 다양한 레이아웃 대응 (스마트에디터3 / 구버전 / 모바일)
    container = (
        soup.find(class_="se-main-container")    # 스마트에디터 3
        or soup.find(class_="post-view")          # 구버전 에디터
        or soup.find(class_="se_component_wrap")  # 일부 구버전
        or soup.find(class_="post_ct")            # 모바일 구버전
        or soup.find(id="postViewArea")           # 아주 구버전
        or soup.find(class_="view")               # 기타 레이아웃
    )

    if container:
        text = container.get_text(separator="\n").strip()
        if len(text) >= 100:
            return text[:4000]

    # 컨테이너 못 찾거나 텍스트 부족 시 → newspaper3k로 폴백
    try:
        return extract_blog(url)
    except Exception:
        raise ValueError("본문을 추출할 수 없는 페이지입니다.")


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
        rapid_headers = {
            "x-rapidapi-key": api_key,
            "x-rapidapi-host": "youtube-transcriptor.p.rapidapi.com",
        }

        rapid_success = False
        for lang in ["ko", "en"]:
            try:
                resp = requests.get(rapid_url, headers=rapid_headers, params={"video_id": vid, "lang": lang}, timeout=15)
                if resp.status_code == 429:
                    raise ValueError(
                        "RapidAPI 월간 요청 한도가 초과되었습니다.\n"
                        "RapidAPI 대시보드에서 플랜을 업그레이드하거나, "
                        "다음 달 갱신을 기다려주세요.\n"
                        "(https://rapidapi.com/benrhzala90/api/youtube-transcriptor)"
                    )
                if resp.status_code in (401, 403):
                    raise ValueError(
                        f"RapidAPI 인증 실패 (HTTP {resp.status_code}).\n"
                        "RAPIDAPI_KEY가 올바른지, 플랜이 활성화되어 있는지 확인해주세요."
                    )
                if resp.status_code != 200:
                    continue
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list) and len(data) > 0:
                        first = data[0]
                        # 응답 구조: [{"transcription": [{"subtitle": "...", ...}], ...}]
                        transcription = first.get("transcription") if isinstance(first, dict) else None
                        if transcription:
                            rapid_success = True
                            result = " ".join(item.get("subtitle", "") for item in transcription).strip()[:4000]
                            if result:
                                return result
            except ValueError:
                raise  # 할당량 초과 에러는 그대로 전파
            except Exception:
                continue

    # 2. youtube-transcript-api 라이브러리 폴백 (로컬 환경 전용)
    # Render 등 배포 서버에서는 YouTube IP 차단으로 동작하지 않을 수 있음
    transcript = None
    last_error = None
    _api = YouTubeTranscriptApi()

    # 2-1. fetch() - ko/en 우선 시도
    try:
        transcript = _api.fetch(video_id=vid, languages=["ko", "en"])
    except Exception as e:
        last_error = e

    # 2-2. list() → 사용 가능한 첫 번째 자막으로 폴백
    if transcript is None:
        try:
            t_list = _api.list(video_id=vid)
            try:
                transcript = t_list.find_transcript(["ko", "en"]).fetch()
            except Exception:
                transcript = next(iter(t_list)).fetch()
        except Exception as e:
            last_error = e

    if transcript is None:
        error_msg = str(last_error) if last_error else "알 수 없는 오류"
        if "blocking requests from your IP" in error_msg or "Too Many Requests" in error_msg:
            raise ValueError(
                "유튜브에서 서버 IP를 차단했습니다.\n"
                "배포 환경에서는 RAPIDAPI_KEY 설정이 필요합니다.\n"
                "현재 RapidAPI 할당량을 확인하거나 플랜을 업그레이드해주세요."
            ) from last_error
        raise ValueError(f"자막을 가져올 수 없습니다: {error_msg}") from last_error

    # FetchedTranscript 객체(t.text), dict(t["text"]) 모두 처리
    def _snippet_text(t) -> str:
        if hasattr(t, "text"):
            return t.text
        return t.get("text", "")

    result = " ".join(_snippet_text(t) for t in transcript).strip()[:4000]
    if not result:
        raise ValueError("자막 데이터가 비어있습니다. 자막이 없는 영상이거나 해당 언어(ko/en) 자막을 지원하지 않습니다.")
    return result


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
