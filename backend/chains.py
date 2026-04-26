from __future__ import annotations

import concurrent.futures
import json
import re
from pathlib import Path
from typing import Any

import anthropic
from dotenv import load_dotenv
from json_repair import repair_json

# Ensure ANTHROPIC_API_KEY is available for `python -c ...` runs too.
load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

client = anthropic.Anthropic()  # ANTHROPIC_API_KEY 환경변수에서 자동 로드

MODEL_NAME = "claude-sonnet-4-6"
FALLBACK_MODEL = "claude-haiku-4-5-20251001"


_JSON_ONLY = "순수한 JSON 객체만 출력하세요. 설명·주석·마크다운 코드블록을 절대 붙이지 마세요."

ANALYZER_PROMPT = """
당신은 SNS 바이럴 콘텐츠 전문가입니다.
아래 콘텐츠에서 다음을 추출하여 JSON으로만 반환하세요. {json_only}

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
""".strip()

LINKEDIN_PROMPT = """
당신은 LinkedIn Top Voice 전문가입니다.
아래 인사이트를 LinkedIn 바이럴 포스트로 변환하고 JSON 객체만 반환하세요. {json_only}

[필수 구조]
1. HOOK (첫 1-2줄): 숫자나 역설로 시작. "더 보기"를 강제로 누르게 만들기.
2. STORY (중간): 1인칭 경험담 또는 구체적 사례. 감정 이입 유도.
3. INSIGHT (핵심): 글머리 기호(•) 3-5개로 핵심 정리. 스캔하기 쉽게.
4. CONTROVERSY: 업계 통념에 반하는 시각 1개 삽입.
5. CTA (마지막): "당신은 어떻게 생각하시나요?" 류의 열린 질문.

[제약]
- 총 1,200~1,500자 / 이모지 최소화 (1-2개) / 해시태그 3개 이하

인사이트 데이터: {structured_insight}

출력 형식:
{{
  "post": "포스트 전문",
  "hook": "첫 1-2줄 요약",
  "viral_score": 0~100,
  "keywords": ["#태그1", "#태그2", "#태그3"],
  "analysis": "LinkedIn 알고리즘에서 유리한 이유 1-2문장"
}}
""".strip()

TWITTER_PROMPT = """
당신은 X(Twitter) 바이럴 스레드 전문가입니다.
아래 인사이트를 5-7개 트윗 스레드로 변환하고 JSON 객체만 반환하세요. {json_only}

[스레드 구조]
트윗 1 (HOOK): 가장 충격적이거나 반직관적 사실. 숫자 포함 권장.
트윗 2-5 (BODY): 각 트윗은 독립적으로도 의미 있게.
트윗 6 (INSIGHT): 개인적 결론 또는 반전.
트윗 7 (CTA): RT/북마크 유도 문구.

[제약]
- 각 트윗 200자 이하 / 이모지 절제 (트윗당 1-2개) / 해시태그 전체 2개 이하

인사이트 데이터: {structured_insight}

출력 형식:
{{
  "thread": ["트윗1", "트윗2", "..."],
  "hook": "첫 트윗 요약",
  "viral_score": 0~100,
  "keywords": ["#태그1", "#태그2"],
  "analysis": "X 알고리즘에서 유리한 이유 1-2문장"
}}
""".strip()

INSTAGRAM_PROMPT = """
당신은 Instagram 성장 전문가입니다.
아래 인사이트를 Instagram 바이럴 캡션으로 변환하고 JSON 객체만 반환하세요. {json_only}

[캡션 구조]
첫 줄 (HOOK, 125자 이하): 저장하고 싶게 만드는 문장.
본문: 핵심 내용을 짧고 명확하게. 줄바꿈 자주. 이모지로 시각적 분리.
저장 유도 + CTA 포함.

[제약]
- 총 캡션 2,200자 이하 / 이모지 적극 활용
- 해시태그 10개 (대형 2·중형 4·소형 4)
- 캐러셀 슬라이드 텍스트 5개 포함

인사이트 데이터: {structured_insight}

출력 형식:
{{
  "caption": "...",
  "hashtags": ["#tag1", "..."],
  "carousel_slides": ["슬라이드1", "슬라이드2", "슬라이드3", "슬라이드4", "슬라이드5"],
  "viral_score": 0~100,
  "keywords": ["#태그1", "#태그2", "#태그3"],
  "analysis": "Instagram 알고리즘에서 유리한 이유 1-2문장"
}}
""".strip()


def run_chain(raw_content: str) -> dict[str, Any]:
    structured_insight = _call_claude(
        ANALYZER_PROMPT.format(raw_content=raw_content[:3000], json_only=_JSON_ONLY),
        max_tokens=1500,
    )

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            "linkedin": executor.submit(generate_linkedin, structured_insight),
            "twitter": executor.submit(generate_twitter, structured_insight),
            "instagram": executor.submit(generate_instagram, structured_insight),
        }
        platform_posts = {k: v.result() for k, v in futures.items()}

    return {"structured_insight": structured_insight, "platform_posts": platform_posts}


def _parse_json_or_raise(raw_text: str) -> dict[str, Any]:
    text = raw_text.strip()

    # 1) 마크다운 코드블록 안의 JSON 추출
    code_block = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if code_block:
        text = code_block.group(1).strip()

    # 2) 직접 파싱 시도
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass

    # 3) regex로 첫 번째 {...} 블록 추출 (앞뒤 불필요한 텍스트 제거)
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            obj = json.loads(match.group())
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            text = match.group()  # 이하 repair 대상으로 좁힘

    # 4) json_repair로 이스케이프 오류·불완전 JSON 자동 복구
    try:
        obj = json.loads(repair_json(text))
        if isinstance(obj, dict):
            return obj
    except Exception:
        pass

    raise ValueError("Claude 응답이 JSON 형식이 아닙니다.")


def _call_claude(prompt: str, max_tokens: int = 1000) -> dict[str, Any]:
    last_err: Exception | None = None
    for model in (MODEL_NAME, FALLBACK_MODEL):
        for attempt in range(2):  # JSON 파싱 실패 시 1회 재시도
            try:
                resp = client.messages.create(
                    model=model,
                    max_tokens=max_tokens,
                    messages=[{"role": "user", "content": prompt}],
                )
                try:
                    return _parse_json_or_raise(resp.content[0].text)
                except ValueError:
                    if attempt == 0:
                        continue  # 같은 모델로 재시도
                    raise
            except anthropic.NotFoundError as e:
                last_err = e
                break  # 다음 모델로
            except ValueError:
                raise
            except Exception as e:
                last_err = e
                break
    if last_err:
        raise last_err
    raise ValueError("Claude 호출에 실패했습니다.")


def generate_linkedin(insight: dict[str, Any]) -> dict[str, Any]:
    result = _call_claude(
        LINKEDIN_PROMPT.format(structured_insight=json.dumps(insight, ensure_ascii=False), json_only=_JSON_ONLY),
        max_tokens=2000,
    )
    result["char_count"] = len(result.get("post", ""))
    result["estimated_reach"] = "HIGH" if result.get("viral_score", 0) >= 80 else "MEDIUM"
    return result


def generate_twitter(insight: dict[str, Any]) -> dict[str, Any]:
    result = _call_claude(
        TWITTER_PROMPT.format(structured_insight=json.dumps(insight, ensure_ascii=False), json_only=_JSON_ONLY),
        max_tokens=2000,
    )
    result["estimated_reach"] = "VIRAL" if result.get("viral_score", 0) >= 85 else "HIGH"
    return result


def generate_instagram(insight: dict[str, Any]) -> dict[str, Any]:
    result = _call_claude(
        INSTAGRAM_PROMPT.format(structured_insight=json.dumps(insight, ensure_ascii=False), json_only=_JSON_ONLY),
        max_tokens=2500,
    )
    result["estimated_reach"] = "HIGH" if result.get("viral_score", 0) >= 80 else "MEDIUM"
    return result

