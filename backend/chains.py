from __future__ import annotations

import json
import re
import os
import time
from pathlib import Path
from typing import Any

import google.genai as genai
from google.genai import types as genai_types
from dotenv import load_dotenv
from json_repair import repair_json

# .env 로드
load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

# Gemini 설정 (여러 키 로드 및 로테이션)
API_KEYS = []
for i in range(1, 6):  # 최대 5개까지 지원
    key = os.getenv(f"GEMINI_API_KEY_{i}") or (os.getenv("GEMINI_API_KEY") if i == 1 else None)
    if key:
        API_KEYS.append(key)

if not API_KEYS:
    print("WARNING: No Gemini API keys found in .env")

# 초기 클라이언트 생성
current_key_index = 0
_client = genai.Client(api_key=API_KEYS[0]) if API_KEYS else None

# 모델 설정 (google.genai 신버전 기준 사용 가능한 모델명)
MODEL_NAME = "gemini-2.5-flash"
FALLBACK_MODEL = "gemini-2.0-flash"


_JSON_ONLY = "순수한 JSON 객체만 출력하세요. 설명·주석·마크다운 코드블록을 절대 붙이지 마세요."

ANALYZER_PROMPT = """
당신은 SNS 바이럴 콘텐츠 전문가입니다.
아래 콘텐츠에서 다음을 추출하여 JSON으로만 반환하세요. {json_only}

0. title: 이 콘텐츠의 제목 (원문 제목이 있으면 그대로, 없으면 핵심 주제 15자 이내 요약)
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

COMBINED_PLATFORM_PROMPT = """
당신은 전 세계 최고의 SNS 바이럴 마케팅 대행사의 '수석 전략가'입니다.
당신의 목표는 제공된 [인사이트 데이터]를 바탕으로, 각 플랫폼에서 '실제로 공유가 터질 수밖에 없는' 초고효율 콘텐츠를 생성하는 것입니다. {json_only}

반드시 아래 JSON 구조로만 반환하세요:
{{
  "linkedin": {{
    "post": "LinkedIn 포스트 전문 (1,200~1,500자, 스토리텔링 중심, 가독성 극대화)",
    "hook": "첫 1-2줄 요약 (더 보기를 누르지 않고는 못 배기게)",
    "viral_score": 0~100,
    "keywords": ["#태그1", "#태그2", "#태그3"],
    "analysis": "LinkedIn 알고리즘(체류 시간, 후킹 강도) 기반 최적화 포인트"
  }},
  "twitter": {{
    "thread": ["트윗1 (강력한 후킹)", "트윗2", "트윗3", "트윗4", "트윗5", "트윗6", "트윗7 (CTA/북마크 유도)"],
    "hook": "첫 트윗 요약",
    "viral_score": 0~100,
    "keywords": ["#태그1", "#태그2"],
    "analysis": "X 알고리즘(북마크 유도, 간결성) 기반 최적화 포인트"
  }},
  "instagram": {{
    "caption": "Instagram 캡션 전문 (이모지 적극 활용, 저장 유도 문구 포함)",
    "hashtags": ["#tag1", "#tag2", "..."],
    "carousel_slides": ["슬라이드1 (메인 훅)", "슬라이드2", "슬라이드3", "슬라이드4", "슬라이드5 (마무리)"],
    "viral_score": 0~100,
    "keywords": ["#태그1", "#태그2", "#태그3"],
    "analysis": "Instagram 알고리즘(저장율, 시각적 정보량) 기반 최적화 포인트"
  }}
}}

[플랫폼별 바이럴 점수(viral_score) 산출 기준]
1. LinkedIn (0-100): 첫 3줄의 후킹 강도(40%) + 개인적 스토리의 공감대(30%) + 명확한 인사이트 전달력(30%)
2. X/Twitter (0-100): 첫 트윗의 충격/논쟁성(50%) + 스레드 전개의 논리적 리듬(30%) + 북마크/RT 유도 문구의 강도(20%)
3. Instagram (0-100): 캡션 첫 줄의 저장 유도력(40%) + 정보의 유익함(40%) + 해시태그 및 캐러셀 텍스트 구성(20%)

[지시사항]
- 모든 콘텐츠는 '평균'을 거부합니다. 가장 공격적이고, 가장 유익하며, 가장 저장하고 싶게 만드세요.
- 인사이트 데이터의 수치나 핵심 키워드를 반드시 활용하여 신뢰도를 높이세요.

인사이트 데이터: {structured_insight}
""".strip()


def run_chain(raw_content: str) -> dict[str, Any]:
    # 1. 분석 단계
    print("Step 1: Analyzing content...")
    structured_insight = _call_gemini(
        ANALYZER_PROMPT.format(raw_content=raw_content[:3000], json_only=_JSON_ONLY),
    )

    # 무료 티어 안정성을 위한 짧은 대기 (연속 호출 방지)
    time.sleep(1.5)

    # 2. 통합 생성 단계
    print("Step 2: Generating posts for all platforms...")
    combined_result = _call_gemini(
        COMBINED_PLATFORM_PROMPT.format(
            structured_insight=json.dumps(structured_insight, ensure_ascii=False), 
            json_only=_JSON_ONLY
        ),
    )
    
    # 후처리: 각 결과에 메타데이터 추가
    for platform in ["linkedin", "twitter", "instagram"]:
        if platform in combined_result:
            res = combined_result[platform]
            if platform == "linkedin":
                res["char_count"] = len(res.get("post", ""))
                res["estimated_reach"] = "HIGH" if res.get("viral_score", 0) >= 80 else "MEDIUM"
            elif platform == "twitter":
                res["estimated_reach"] = "VIRAL" if res.get("viral_score", 0) >= 85 else "HIGH"
            elif platform == "instagram":
                res["estimated_reach"] = "HIGH" if res.get("viral_score", 0) >= 80 else "MEDIUM"

    return {
        "title": structured_insight.get("title", ""),
        "structured_insight": structured_insight,
        "platform_posts": combined_result,
    }


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

    raise ValueError("Gemini 응답이 JSON 형식이 아닙니다.")


def _call_gemini(prompt: str) -> dict[str, Any]:
    global current_key_index, _client
    last_err: Exception | None = None

    # 전체 시도 횟수: 키 수 * 2 (각 키당 메인+폴백 모델)
    total_attempts = max(4, len(API_KEYS) * 2)

    for attempt in range(total_attempts):
        if _client is None:
            raise ValueError("Gemini API 키가 설정되지 않았습니다.")

        # attempt 짝수 → 메인 모델, 홀수 → 폴백 모델
        model_name = MODEL_NAME if attempt % 2 == 0 else FALLBACK_MODEL

        try:
            print(f"[Attempt {attempt+1}] Key #{current_key_index+1}, Model: {model_name}")
            resp = _client.models.generate_content(
                model=model_name,
                contents=prompt,
            )

            text = resp.text if resp and resp.text else None
            if not text:
                print(f"Empty response from {model_name}, possible safety block.")
                continue

            try:
                return _parse_json_or_raise(text)
            except ValueError as ve:
                print(f"JSON Parsing failed for {model_name}, retrying...")
                time.sleep(1)
                continue

        except Exception as e:
            last_err = e
            err_msg = str(e)
            print(f"Gemini Error (Key #{current_key_index+1}, {model_name}): {err_msg}")

            # 429 에러 시 다음 키로 즉시 교체 후 재시도
            if "429" in err_msg:
                if len(API_KEYS) > 1:
                    current_key_index = (current_key_index + 1) % len(API_KEYS)
                    _client = genai.Client(api_key=API_KEYS[current_key_index])
                    print(f"Rate limit (429). Rotating to API Key #{current_key_index + 1}...")
                    time.sleep(2)
                    continue  # 새 키로 즉시 재시도
                else:
                    # 키가 1개뿐이면 잠시 대기 후 재시도
                    print("429 but only 1 key. Waiting 5s before retry...")
                    time.sleep(5)
                    continue

            time.sleep(2)

    if last_err:
        raise last_err
    raise ValueError("Gemini 호출에 실패했습니다.")

