from __future__ import annotations

import re

from newspaper import Article
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import NoTranscriptFound, TranscriptsDisabled


def extract_content(url: str) -> tuple[str, str]:
    """Returns (source_type, content_text)."""
    if "youtube.com" in url or "youtu.be" in url:
        return "youtube", extract_youtube(url)
    return "blog", extract_blog(url)


def extract_youtube(url: str) -> str:
    video_id = re.search(r"v=([^&]+)", url) or re.search(r"youtu\.be/([^?]+)", url)
    if not video_id:
        raise ValueError("Invalid YouTube URL")
    vid = video_id.group(1)
    api = YouTubeTranscriptApi()
    try:
        try:
            transcript = api.fetch(vid, languages=["ko", "en"])
        except (NoTranscriptFound, TranscriptsDisabled):
            # ko/en 없으면 사용 가능한 첫 번째 언어로 폴백
            tlist = api.list(vid)
            first = next(iter(tlist))
            transcript = api.fetch(vid, languages=[first.language_code])
    except TranscriptsDisabled as e:
        raise ValueError("자막이 비활성화된 영상입니다.") from e
    except NoTranscriptFound as e:
        raise ValueError("자막이 없는 영상입니다. 자막이 있는 영상 URL을 입력해주세요.") from e
    except Exception as e:
        raise ValueError("자막을 가져올 수 없는 영상입니다.") from e

    return " ".join(t.text for t in transcript).strip()[:4000]


def extract_blog(url: str) -> str:
    article = Article(url, language="ko")
    try:
        article.download()
        article.parse()
    except Exception as e:
        raise ValueError("콘텐츠를 가져올 수 없습니다.") from e
    text = (article.text or "").strip()
    if not text or len(text) < 100:
        raise ValueError("본문을 추출할 수 없는 페이지입니다.")
    return text[:4000]

