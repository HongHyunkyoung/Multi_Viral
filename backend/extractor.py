from __future__ import annotations

import re

try:
    from newspaper import Article
    HAS_NEWSPAPER = True
except ImportError:
    HAS_NEWSPAPER = False

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import NoTranscriptFound, TranscriptsDisabled


def extract_content(url: str) -> tuple[str, str]:
    """Returns (source_type, content_text)."""
    if "youtube.com" in url or "youtu.be" in url:
        return "youtube", extract_youtube(url)
    return "blog", extract_blog(url)


def extract_youtube(url: str) -> str:
    video_id_match = re.search(r"v=([^&]+)", url) or re.search(r"youtu\.be/([^?]+)", url)
    if not video_id_match:
        raise ValueError("올바른 YouTube URL이 아닙니다.")
    
    vid = video_id_match.group(1)
    api = YouTubeTranscriptApi()
    
    try:
        # 1. ko, en 순서로 자막 시도
        try:
            transcript = api.fetch(vid, languages=["ko", "en"])
        except (NoTranscriptFound, TranscriptsDisabled):
            # 2. ko/en 없으면 사용 가능한 첫 번째 언어로 폴백
            tlist = api.list(vid)
            first = next(iter(tlist))
            transcript = api.fetch(vid, languages=[first.language_code])
            
    except TranscriptsDisabled as e:
        raise ValueError("자막이 비활성화된 영상입니다.") from e
    except NoTranscriptFound as e:
        raise ValueError("자막이 없는 영상입니다. 자막이 있는 영상 URL을 입력해주세요.") from e
    except Exception as e:
        # YouTube 차단(IP Block) 등의 사유 포함
        error_msg = str(e)
        if "Too Many Requests" in error_msg:
             raise ValueError("YouTube에서 요청이 일시적으로 차단되었습니다. 잠시 후 다시 시도해주세요.") from e
        raise ValueError(f"자막을 가져올 수 없습니다: {error_msg}") from e

    # t가 객체일 수도 있고 딕셔너리일 수도 있으므로 안전하게 처리
    return " ".join(t.get("text", "") if isinstance(t, dict) else getattr(t, "text", "") for t in transcript).strip()[:4000]


def extract_blog(url: str) -> str:
    if not HAS_NEWSPAPER:
        return f"현재 환경에서 블로그 추출 라이브러리(newspaper3k)를 사용할 수 없습니다. URL: {url}"

    article = Article(url, language="ko")
    try:
        article.download()
        article.parse()
    except Exception as e:
        raise ValueError(f"블로그 콘텐츠를 가져올 수 없습니다: {str(e)}") from e
    
    text = (article.text or "").strip()
    if not text or len(text) < 100:
        raise ValueError("본문을 충분히 추출할 수 없는 페이지입니다. (최소 100자 이상 필요)")
    
    return text[:4000]
