# SPEC.md — One URL, Multi-Viral (v2 — Updated)
> Single Source of Truth | CMUX x AIM 해커톤 | 제출 마감: 오후 6시

## ⚡ v2 변경 요약
| 항목 | 변경 전 | 변경 후 |
|------|--------|--------|
| 모델명 | `claude-sonnet-4-20250514` (존재 X) | `claude-sonnet-4-5-20251001` ✅ |
| 비상 모델 | `claude-haiku-4-5-20251001` | `claude-haiku-4-5-20251001` ✅ |
| 스크래퍼 | BeautifulSoup (혼재) | `newspaper3k` 단일화 ✅ |
| API 응답 | 포스트 텍스트만 | + `viral_score` + `keywords` + `analysis` ✅ |
| 프론트엔드 | `/` + `/result` 2페이지 | `page.tsx` 단일 페이지 조건부 렌더링 ✅ |

---

## 0. TL;DR (30초 요약)

URL 하나 → 콘텐츠 추출 → Claude API 3단 프롬프트 체이닝 → LinkedIn / X / Instagram 바이럴 포스트 자동 생성. DB 없음, In-memory 처리, FastAPI + Next.js 단일 스택.

---

## 1. 전체 아키텍처 흐름도

```
[사용자]
   │
   │ URL 입력 (YouTube / Blog)
   ▼
[Next.js Frontend]
   │  POST /api/extract
   ▼
[FastAPI Backend]
   ├─── YouTube URL?
   │       └── youtube-transcript-api → 자막 텍스트 추출
   └─── Blog URL?
           └── newspaper3k (Article) → 본문 텍스트 추출
   │
   │ raw_content (텍스트)
   ▼
[Claude API — Chain Step 1: 콘텐츠 분석기]
   └── 핵심 인사이트 3개 + 감정 훅 + 타겟 페르소나 추출
   │
   │ structured_insight (JSON)
   ▼
[Claude API — Chain Step 2: 플랫폼 최적화 생성기] ← 병렬 3회 호출
   ├── LinkedIn 포스트 생성
   ├── X (Twitter) 스레드 생성
   └── Instagram 캡션 + 해시태그 생성
   │
   │ platform_posts (JSON)
   ▼
[FastAPI — In-memory 캐시 (dict, TTL 1시간)]
   │
   │ response JSON
   ▼
[Next.js Frontend — 단일 페이지 조건부 렌더링]
   ├── [입력 상태] URL 입력 폼
   └── [결과 상태] 플랫폼별 탭 (LinkedIn / X / Instagram)
       ├── 포스트 텍스트 + 원클릭 복사
       ├── Viral Score 배지 (0-100)
       ├── 핵심 키워드 태그
       └── AI 분석 코멘트
```

---

## 2. 디렉토리 구조

```
one-url-multi-viral/
├── backend/
│   ├── main.py              # FastAPI 앱 진입점
│   ├── extractor.py         # URL 콘텐츠 추출 (YouTube + newspaper3k)
│   ├── chains.py            # Claude API 프롬프트 체이닝
│   ├── cache.py             # In-memory 캐시
│   └── requirements.txt
├── frontend/
│   ├── app/
│   │   └── page.tsx         # 단일 페이지 (입력 + 결과 조건부 렌더링)
│   ├── components/
│   │   ├── UrlInput.tsx
│   │   ├── PlatformCard.tsx  # viral_score + keywords + analysis 포함
│   │   └── CopyButton.tsx
│   └── package.json
└── SPEC.md
```

---

## 3. Database Schema (In-Memory, DB 없음)

```python
# cache.py — 딕셔너리 기반 In-memory store
# key: sha256(url), value: CachedResult

class CachedResult(TypedDict):
    url: str
    raw_content: str          # 추출된 원문 텍스트
    structured_insight: dict  # Chain Step 1 결과
    platform_posts: dict      # Chain Step 2 결과
    created_at: float         # time.time()
    ttl: int                  # 3600초 (1시간)

# 구조 예시
cache_store: dict[str, CachedResult] = {}
```

---

## 4. API 엔드포인트 설계

### Backend (FastAPI, 기본 포트: 8000)

#### POST `/api/generate`
콘텐츠 추출부터 포스트 생성까지 전체 파이프라인 실행.

**Request**
```json
{
  "url": "https://www.youtube.com/watch?v=xxxxx"
}
```

**Response (200 OK)**
```json
{
  "cache_hit": false,
  "source_type": "youtube",
  "title": "영상/글 제목",
  "platform_posts": {
    "linkedin": {
      "post": "LinkedIn 포스트 전문...",
      "hook": "첫 문장 후킹",
      "estimated_reach": "HIGH",
      "char_count": 1200,
      "viral_score": 91,
      "keywords": ["#AI전환", "#커리어성장", "#리더십"],
      "analysis": "첫 문장의 역설적 후킹이 체류 시간을 40% 높일 것으로 예상. 수치 기반 인사이트가 공유율 상승에 기여."
    },
    "twitter": {
      "thread": ["트윗 1/5", "트윗 2/5", "..."],
      "hook": "첫 트윗 후킹",
      "estimated_reach": "VIRAL",
      "viral_score": 87,
      "keywords": ["#AI", "#스레드", "#테크"],
      "analysis": "첫 트윗의 숫자 후킹이 북마크 저장을 유도. 7개 스레드 구조가 완독률 최적."
    },
    "instagram": {
      "caption": "인스타그램 캡션...",
      "hashtags": ["#AI", "#테크", "#성장"],
      "hook": "첫 줄 후킹",
      "estimated_reach": "MEDIUM",
      "viral_score": 78,
      "keywords": ["#저장필수", "#AI꿀팁", "#성장"],
      "carousel_slides": ["슬라이드1", "슬라이드2", "슬라이드3", "슬라이드4", "슬라이드5"],
      "analysis": "저장 유도 CTA와 캐러셀 구조가 알고리즘 노출 극대화에 유리."
    }
  },
  "processing_time_ms": 4200
}
```

**Error Responses**
```json
{ "error": "UNSUPPORTED_URL", "message": "YouTube 또는 블로그 URL만 지원합니다." }
{ "error": "EXTRACTION_FAILED", "message": "콘텐츠를 가져올 수 없습니다." }
{ "error": "API_LIMIT", "message": "잠시 후 다시 시도해주세요." }
```

#### GET `/api/health`
```json
{ "status": "ok", "cache_size": 12 }
```

#### DELETE `/api/cache`
캐시 전체 초기화 (개발용)

---

## 5. Algorithm Strategy — 플랫폼별 프롬프트 체이닝

### Chain Step 1: 콘텐츠 분석기 (공통)
> 목적: 원문에서 알고리즘 친화적 요소 추출

```python
ANALYZER_PROMPT = """
당신은 SNS 바이럴 콘텐츠 전문가입니다.
아래 콘텐츠에서 다음을 JSON으로 추출하세요:

1. core_insights: 핵심 인사이트 3가지 (각 1문장, 구체적 수치 포함 우선)
2. emotional_hook: 독자의 감정을 자극하는 포인트 (공포/희망/놀라움/분노 중 택1 + 이유)
3. target_persona: 이 콘텐츠가 가장 가치 있을 페르소나 (직군, 관심사, 고민)
4. controversy_angle: 논쟁을 유발할 수 있는 반전 시각
5. cta_suggestion: 댓글/공유를 유도하는 행동 유도 문구
6. platform_scores: 각 플랫폼 바이럴 적합도 점수 (0-100)
   - linkedin_score: 전문성/인사이트 밀도 기반
   - twitter_score: 논쟁성/간결성 기반
   - instagram_score: 시각화 가능성/감성 기반
7. top_keywords: 각 플랫폼 해시태그용 핵심 키워드 5개

콘텐츠:
{raw_content}

반드시 JSON만 반환하세요.
"""
```

**예상 토큰: ~800 input / ~300 output**

---

### Chain Step 2-A: LinkedIn 알고리즘 최적화

**LinkedIn 2024-2025 알고리즘 핵심:**
- 첫 3줄(hook)에서 "더 보기" 클릭을 유도해야 함
- 개인적 스토리 + 교훈 구조가 dwell time 최대화
- 1,200~1,500자 적정 (너무 짧으면 낮은 배포)
- 댓글 초기 속도가 도달 범위 결정 (30분 내 댓글 유도)
- 이미지 없는 텍스트 전용 포스트가 오히려 높은 유기적 도달

```python
LINKEDIN_PROMPT = """
당신은 LinkedIn Top Voice 전문가입니다.
아래 인사이트를 LinkedIn 바이럴 포스트로 변환하세요.

[필수 구조]
1. HOOK (첫 1-2줄): 숫자나 역설로 시작. "더 보기"를 강제로 누르게 만들기.
   예: "저는 3년 동안 틀렸습니다." / "대부분의 개발자가 모르는 사실:"
2. STORY (중간): 1인칭 경험담 또는 구체적 사례. 감정 이입 유도.
3. INSIGHT (핵심): 글머리 기호(•) 3-5개로 핵심 정리. 스캔하기 쉽게.
4. CONTROVERSY: 업계 통념에 반하는 시각 1개 삽입.
5. CTA (마지막): "당신은 어떻게 생각하시나요?" 류의 열린 질문.

[제약]
- 총 1,200~1,500자
- 이모지 최소화 (1-2개만)
- 해시태그 3개 이하, 본문 끝에만
- 단락 간 공백 줄 삽입 (가독성)

인사이트 데이터: {structured_insight}

JSON 형식으로 반환:
{{
  "post": "포스트 전문",
  "hook": "첫 1-2줄 요약",
  "viral_score": 0-100 (후킹 강도 + 인사이트 밀도 + CTA 명확성 기반),
  "keywords": ["#태그1", "#태그2", "#태그3"],
  "analysis": "이 포스트가 LinkedIn 알고리즘에서 유리한 이유 1-2문장"
}}
"""
```

**예상 토큰: ~500 input / ~600 output**

---

### Chain Step 2-B: X (Twitter) 알고리즘 최적화

**X 2024-2025 알고리즘 핵심:**
- 스레드 첫 트윗의 impression → 팔로워 반응율이 배포 결정
- 북마크 수가 좋아요보다 2-3배 가중치
- 외부 링크 포함 시 도달 70% 감소 → 링크는 답글로
- 280자 꽉 채울 필요 없음, 임팩트 있으면 짧을수록 good
- 스레드는 5-7개 트윗이 최적 (너무 길면 이탈)

```python
TWITTER_PROMPT = """
당신은 X(Twitter) 바이럴 스레드 전문가입니다.
아래 인사이트를 5-7개 트윗 스레드로 변환하세요.

[스레드 구조]
트윗 1 (HOOK): 가장 충격적이거나 반직관적 사실. 숫자 포함 권장.
             형식: "[충격 사실]\n\n스레드로 설명합니다 🧵"
트윗 2-5 (BODY): 각 트윗은 독립적으로도 의미 있게. 목록(1/ 2/ 형식) 또는 짧은 단락.
트윗 6 (INSIGHT): 개인적 결론 또는 반전.
트윗 7 (CTA): "RT하면 더 많은 사람에게 닿습니다" + 북마크 유도 문구.

[제약]
- 각 트윗 200자 이하 권장 (한글 기준)
- 이모지 절제 (트윗당 1-2개)
- 외부 링크 포함 금지 (마지막 답글로 유도)
- 해시태그 최소화 (스레드 전체 2개 이하)

인사이트 데이터: {structured_insight}

JSON 형식: {
  "thread": ["트윗1", "트윗2", ...],
  "hook": "첫 트윗 요약",
  "viral_score": 0-100 (논쟁성 + 북마크 유도력 + 간결성 기반),
  "keywords": ["#태그1", "#태그2"],
  "analysis": "이 스레드가 X 알고리즘에서 유리한 이유 1-2문장"
}
"""
```

**예상 토큰: ~500 input / ~500 output**

---

### Chain Step 2-C: Instagram 알고리즘 최적화

**Instagram 2024-2025 알고리즘 핵심:**
- Reels > Carousel > 단일 이미지 순으로 도달
- 캡션 첫 줄 125자가 핵심 (더 보기 전)
- 저장(Save) 수가 가장 높은 가중치
- 해시태그 5-10개 최적 (30개는 스팸 패널티)
- 계정 규모별 해시태그 전략 상이 (소규모: 니치 태그 우선)

```python
INSTAGRAM_PROMPT = """
당신은 Instagram 성장 전문가입니다.
아래 인사이트를 Instagram 바이럴 캡션으로 변환하세요.

[캡션 구조]
첫 줄 (HOOK, 125자 이하): 저장하고 싶게 만드는 문장.
                         예: "이거 모르면 손해 보는 AI 꿀팁 5가지 📌"
본문: 핵심 내용을 짧고 명확하게. 줄바꿈 자주. 이모지로 시각적 분리.
저장 유도: "나중에 써먹으려면 저장 필수 🔖"
CTA: "어떻게 생각해? 댓글로 알려줘 👇"

[해시태그 전략]
- 대형(100만+): 2개
- 중형(10만-100만): 4개  
- 소형(1만-10만, 니치): 4개
총 10개, 캡션 끝에 줄바꿈 후 삽입

[제약]
- 총 캡션 2,200자 이하
- 이모지 적극 활용 (가독성 향상)
- 카드뉴스/캐러셀 제작용 슬라이드 텍스트 5개도 함께 제안

인사이트 데이터: {structured_insight}

JSON 형식: {
  "caption": "...",
  "hashtags": ["#tag1", ...],
  "carousel_slides": ["슬라이드1", "슬라이드2", ...],
  "viral_score": 0-100 (저장 유도력 + 감성 공감도 + 시각화 가능성 기반),
  "keywords": ["#태그1", "#태그2", "#태그3"],
  "analysis": "이 캡션이 Instagram 알고리즘에서 유리한 이유 1-2문장"
}
"""
```

**예상 토큰: ~500 input / ~600 output**

---

## 6. 핵심 코드 스니펫

### backend/chains.py (핵심 로직)

```python
import anthropic
import json
import concurrent.futures

client = anthropic.Anthropic()  # ANTHROPIC_API_KEY 환경변수에서 자동 로드

# ✅ 실제 사용 가능한 모델명
MODEL_NAME = "claude-sonnet-4-5-20251001"
FALLBACK_MODEL = "claude-haiku-4-5-20251001"  # 비상용 (약 10배 저렴)

def run_chain(raw_content: str) -> dict:
    # Step 1: 분석 (공통)
    insight_response = client.messages.create(
        model=MODEL_NAME,
        max_tokens=600,
        messages=[{
            "role": "user",
            "content": ANALYZER_PROMPT.format(raw_content=raw_content[:3000])
        }]
    )
    structured_insight = json.loads(insight_response.content[0].text)

    # Step 2: 병렬 생성 (3개 플랫폼 동시)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            "linkedin": executor.submit(generate_linkedin, structured_insight),
            "twitter": executor.submit(generate_twitter, structured_insight),
            "instagram": executor.submit(generate_instagram, structured_insight),
        }
        platform_posts = {k: v.result() for k, v in futures.items()}

    return {"structured_insight": structured_insight, "platform_posts": platform_posts}

def _call_claude(prompt: str, max_tokens: int = 1000) -> dict:
    """공통 Claude 호출 + JSON 파싱 헬퍼"""
    resp = client.messages.create(
        model=MODEL_NAME,
        max_tokens=max_tokens,
        messages=[{"role": "user", "content": prompt}]
    )
    raw = resp.content[0].text.strip()
    # JSON 펜스 제거 후 파싱
    clean = raw.replace("```json", "").replace("```", "").strip()
    return json.loads(clean)

def generate_linkedin(insight: dict) -> dict:
    result = _call_claude(
        LINKEDIN_PROMPT.format(structured_insight=json.dumps(insight, ensure_ascii=False))
    )
    result["char_count"] = len(result.get("post", ""))
    result["estimated_reach"] = "HIGH" if result.get("viral_score", 0) >= 80 else "MEDIUM"
    return result

def generate_twitter(insight: dict) -> dict:
    result = _call_claude(
        TWITTER_PROMPT.format(structured_insight=json.dumps(insight, ensure_ascii=False))
    )
    result["estimated_reach"] = "VIRAL" if result.get("viral_score", 0) >= 85 else "HIGH"
    return result

def generate_instagram(insight: dict) -> dict:
    result = _call_claude(
        INSTAGRAM_PROMPT.format(structured_insight=json.dumps(insight, ensure_ascii=False))
    )
    result["estimated_reach"] = "HIGH" if result.get("viral_score", 0) >= 75 else "MEDIUM"
    return result
```

### backend/extractor.py (newspaper3k 통일)

```python
from newspaper import Article
from youtube_transcript_api import YouTubeTranscriptApi
import re

def extract_content(url: str) -> tuple[str, str]:
    """Returns (source_type, content_text)"""
    if "youtube.com" in url or "youtu.be" in url:
        return "youtube", extract_youtube(url)
    else:
        return "blog", extract_blog(url)

def extract_youtube(url: str) -> str:
    video_id = re.search(r"v=([^&]+)", url) or re.search(r"youtu\.be/([^?]+)", url)
    if not video_id:
        raise ValueError("Invalid YouTube URL")
    try:
        transcript = YouTubeTranscriptApi.get_transcript(
            video_id.group(1), languages=["ko", "en"]
        )
    except Exception:
        raise ValueError("자막이 없는 영상입니다. 자막이 있는 영상 URL을 입력해주세요.")
    return " ".join([t["text"] for t in transcript])[:4000]

def extract_blog(url: str) -> str:
    # ✅ newspaper3k: 광고/네비/푸터 자동 제거, 본문만 정확히 추출
    article = Article(url, language="ko")
    article.download()
    article.parse()
    if not article.text or len(article.text) < 100:
        raise ValueError("본문을 추출할 수 없는 페이지입니다.")
    return article.text[:4000]
```

### backend/requirements.txt

```
fastapi==0.115.0
uvicorn==0.30.0
anthropic==0.34.0
youtube-transcript-api==0.6.2
newspaper3k==0.2.8
lxml[html_clean]==5.2.2
python-dotenv==1.0.1
```

> ⚠️ `newspaper3k` 설치 시 `lxml[html_clean]`을 반드시 함께 설치해야 합니다.

---

## 7. Hourly Roadmap (10:40 AM → 6:00 PM)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🕙 10:40 – 11:30 | [SETUP] 프로젝트 뼈대
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ SPEC.md 숙지 (이 문서)
□ Git repo 초기화
□ Backend: FastAPI 프로젝트 생성 + requirements 설치
□ Frontend: Next.js 프로젝트 생성 (npx create-next-app)
□ .env 파일 설정 (ANTHROPIC_API_KEY)
□ CORS 설정 확인
체크포인트: FastAPI /health 엔드포인트 응답 확인

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🕚 11:30 – 12:30 | [CORE] 추출 + Chain Step 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ extractor.py 구현 (YouTube + Blog)
□ chains.py — ANALYZER_PROMPT + Step 1 함수
□ /api/generate 엔드포인트 연결
□ curl로 YouTube URL 하나 테스트
체크포인트: structured_insight JSON 반환 확인

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🕛 12:30 – 13:30 | [CORE] Chain Step 2 (3 플랫폼)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ generate_linkedin() 구현 + 테스트
□ generate_twitter() 구현 + 테스트
□ generate_instagram() 구현 + 테스트
□ 병렬 실행 (ThreadPoolExecutor) 적용
□ In-memory 캐시 (cache.py) 구현
체크포인트: /api/generate 전체 파이프라인 정상 응답

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🍱 13:30 – 14:00 | 점심 + 버퍼 (빠진 버그 수정)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🕒 14:00 – 15:30 | [FRONTEND] UI 구현
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ 메인 페이지: URL 입력 폼 + 로딩 애니메이션
□ 결과 페이지: 3개 탭 (LinkedIn / X / Instagram)
□ PlatformCard 컴포넌트 (포스트 텍스트 + 복사 버튼)
□ 예상 도달 지표 더미 배지 (HIGH / VIRAL / MEDIUM)
□ 반응형 레이아웃 기본 처리
체크포인트: E2E 흐름 UI에서 동작 확인

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🕓 15:30 – 16:30 | [POLISH] UX + 에러 처리
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ 에러 메시지 UI (잘못된 URL, API 실패)
□ 로딩 스피너 + 진행 단계 표시 ("분석 중... / 생성 중...")
□ 복사 완료 토스트 알림
□ 캐시 히트 시 빠른 응답 표시
□ 실제 유튜브 영상 3개 테스트 (다양한 카테고리)
체크포인트: 데모용 URL 3개 정상 동작 확인

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🕔 16:30 – 17:15 | [DEPLOY] 배포 or 로컬 데모 준비
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ 옵션 A (권장): ngrok으로 로컬 서버 외부 공개
     → ngrok http 8000 / ngrok http 3000
□ 옵션 B: Vercel (Frontend) + Railway/Render (Backend)
□ 데모용 URL 3개 미리 캐시에 워밍업
□ README.md 작성 (설치법 + 사용법 1페이지)
체크포인트: 외부에서 접근 가능한 URL 확보

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🕔 17:15 – 18:00 | [PITCH] 피칭 준비
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
□ 데모 시나리오 확정 (URL 하나 골라서 라이브 시연)
□ 핵심 차별점 3줄 정리:
    1. 단순 요약이 아닌 플랫폼 알고리즘 기반 최적화
    2. 3단 프롬프트 체이닝으로 후킹 극대화
    3. URL 하나로 3개 플랫폼 동시 공략
□ 예상 질문 답변 준비
□ 최종 제출
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 8. $25 Credit 전략

### 토큰 소비 추정 (1회 요청 기준)

| 단계 | Input 토큰 | Output 토큰 | 비용 추정 |
|------|-----------|------------|---------|
| Step 1: 분석기 | ~800 | ~300 | ~$0.004 |
| Step 2-A: LinkedIn | ~500 | ~600 | ~$0.004 |
| Step 2-B: X | ~500 | ~500 | ~$0.003 |
| Step 2-C: Instagram | ~500 | ~600 | ~$0.004 |
| **1회 총합** | **~2,300** | **~2,000** | **~$0.015** |

**→ $25로 약 1,600회 요청 가능. 개발 중 100회 테스트해도 $1.5 소비.**

### 크레딧 절약 전칙

```python
# 규칙 1: 개발 중 raw_content를 3000자로 제한 (실제 서비스는 4000자)
raw_content = raw_content[:3000]  # 개발 테스트 시
raw_content = raw_content[:4000]  # 실제 서비스 시

# 규칙 2: 동일 URL 재요청 시 캐시 활용 (API 호출 0회)
if url_hash in cache_store and not expired:
    return cache_store[url_hash]

# 규칙 3: 프롬프트 개발 시 Step 1만 먼저 테스트
# Step 2는 Step 1이 완벽해진 후 테스트

# 규칙 4: 개발 초기에는 max_tokens를 낮게 설정
max_tokens=300  # 프롬프트 검증 단계
max_tokens=1000 # 완성 단계

# 규칙 5: 데모용 URL 3개 미리 캐싱 후 발표 (발표 중 API 미사용)
DEMO_URLS = [
    "https://www.youtube.com/watch?v=XXXXX",  # 기술 관련
    "https://www.youtube.com/watch?v=YYYYY",  # 비즈니스 관련
    "https://blog.example.com/ai-post",        # 블로그 예시
]
```

### 비상 시나리오 (API 크레딧 소진 위험 시)

- Haiku 모델로 폴백: `claude-haiku-4-5-20251001` (약 10배 저렴, `FALLBACK_MODEL` 상수로 즉시 교체)
- Step 2 병렬 → 순차 실행으로 전환 (속도 감소 but 에러 추적 용이)
- max_tokens 800으로 제한

---

## 9. 환경 변수 설정

```bash
# backend/.env
ANTHROPIC_API_KEY=sk-ant-xxxxx
CACHE_TTL=3600
MAX_CONTENT_LENGTH=4000
CORS_ORIGINS=http://localhost:3000

# frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 10. 빠른 시작 (Quick Start)

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (새 터미널)
cd frontend
npm install
npm run dev  # http://localhost:3000

# 외부 공개 (데모용)
ngrok http 3000
```

---

## 11. 피칭 핵심 메시지

> **"SNS 마케터가 3시간 걸리던 작업을 30초로."**
>
> 단순 요약 도구가 아닙니다.
> LinkedIn은 체류시간 알고리즘, X는 북마크 가중치, Instagram은 저장율.
> 각 플랫폼의 알고리즘 로직을 프롬프트에 이식해 바이럴 확률을 설계합니다.
> URL 하나, 플랫폼 셋, 결과는 즉시.

---

*Last updated: v2 — 모델명·스크래퍼·Score 로직·단일페이지 반영 완료*
