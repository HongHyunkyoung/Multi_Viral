from __future__ import annotations

import json
import re
import os
import time
from pathlib import Path
from typing import Any

import google.generativeai as genai
from dotenv import load_dotenv
from json_repair import repair_json

<<<<<<< HEAD
# .env 로드
load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

# Gemini 설정
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("Gemini_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
=======
load_dotenv(dotenv_path=Path(__file__).with_name(".env"))

client = anthropic.Anthropic()
>>>>>>> bc1b2e96a9e6372f937d1643bcb7db5ae6c82540

# 모델 설정
MODEL_NAME = "gemini-2.5-flash" 
FALLBACK_MODEL = "gemini-flash-latest"

_JSON_ONLY = "순수한 JSON 객체만 출력하세요. 설명·주석·마크다운 코드블록을 절대 붙이지 마세요."

<<<<<<< HEAD
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

COMBINED_PLATFORM_PROMPT = """
당신은 전 세계 최고의 SNS 바이럴 마케팅 대행사의 '수석 전략가'입니다.
당신의 목표는 제공된 [인사이트 데이터]를 바탕으로, 각 플랫폼에서 '실제로 공유가 터질 수밖에 없는' 초고효율 콘텐츠를 생성하는 것입니다. {json_only}
=======
LINKEDIN_PROMPT = """
당신은 LinkedIn Top Voice 전문가입니다.
아래 원문 콘텐츠를 분석하고 LinkedIn 바이럴 포스트로 변환하세요. JSON 객체만 반환하세요. {json_only}
>>>>>>> bc1b2e96a9e6372f937d1643bcb7db5ae6c82540

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

<<<<<<< HEAD
인사이트 데이터: {structured_insight}
=======
원문 콘텐츠:
{raw_content}

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
아래 원문 콘텐츠를 분석하고 5-7개 트윗 스레드로 변환하세요. JSON 객체만 반환하세요. {json_only}

[스레드 구조]
트윗 1 (HOOK): 가장 충격적이거나 반직관적 사실. 숫자 포함 권장.
트윗 2-5 (BODY): 각 트윗은 독립적으로도 의미 있게.
트윗 6 (INSIGHT): 개인적 결론 또는 반전.
트윗 7 (CTA): RT/북마크 유도 문구.

[제약]
- 각 트윗 200자 이하 / 이모지 절제 (트윗당 1-2개) / 해시태그 전체 2개 이하

원문 콘텐츠:
{raw_content}

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
아래 원문 콘텐츠를 분석하고 Instagram 바이럴 캡션으로 변환하세요. JSON 객체만 반환하세요. {json_only}

[캡션 구조]
첫 줄 (HOOK, 125자 이하): 저장하고 싶게 만드는 문장.
본문: 핵심 내용을 짧고 명확하게. 줄바꿈 자주. 이모지로 시각적 분리.
저장 유도 + CTA 포함.

[제약]
- 총 캡션 2,200자 이하 / 이모지 적극 활용
- 해시태그 10개 (대형 2·중형 4·소형 4)
- 캐러셀 슬라이드 텍스트 5개 포함

원문 콘텐츠:
{raw_content}

출력 형식:
{{
  "caption": "...",
  "hashtags": ["#tag1", "..."],
  "carousel_slides": ["슬라이드1", "슬라이드2", "슬라이드3", "슬라이드4", "슬라이드5"],
  "viral_score": 0~100,
  "keywords": ["#태그1", "#태그2", "#태그3"],
  "analysis": "Instagram 알고리즘에서 유리한 이유 1-2문장"
}}
>>>>>>> bc1b2e96a9e6372f937d1643bcb7db5ae6c82540
""".strip()


def run_chain(raw_content: str) -> dict[str, Any]:
<<<<<<< HEAD
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

    return {"structured_insight": structured_insight, "platform_posts": combined_result}
=======
    content = raw_content[:2500]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            "linkedin":  executor.submit(generate_linkedin, content),
            "twitter":   executor.submit(generate_twitter, content),
            "instagram": executor.submit(generate_instagram, content),
        }
        platform_posts = {k: v.result() for k, v in futures.items()}
    return {"platform_posts": platform_posts}
>>>>>>> bc1b2e96a9e6372f937d1643bcb7db5ae6c82540


def _parse_json_or_raise(raw_text: str) -> dict[str, Any]:
    text = raw_text.strip()

    code_block = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if code_block:
        text = code_block.group(1).strip()

    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            obj = json.loads(match.group())
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            text = match.group()

    try:
        obj = json.loads(repair_json(text))
        if isinstance(obj, dict):
            return obj
    except Exception:
        pass

    raise ValueError("Gemini 응답이 JSON 형식이 아닙니다.")


def _call_gemini(prompt: str) -> dict[str, Any]:
    last_err: Exception | None = None
<<<<<<< HEAD
    
    # 무료 티어에서 429 에러 방지를 위한 재시도 로직 강화
    for model_name in (MODEL_NAME, FALLBACK_MODEL):
        model = genai.GenerativeModel(model_name)
        for attempt in range(2):  # JSON 파싱 실패 시 1회 재시도
=======
    for model in (MODEL_NAME, FALLBACK_MODEL):
        for attempt in range(2):
>>>>>>> bc1b2e96a9e6372f937d1643bcb7db5ae6c82540
            try:
                resp = model.generate_content(prompt)
                
                # 안전 필터 등으로 인해 텍스트가 비어있을 수 있음
                if not resp or not resp.text:
                    print(f"Empty response from {model_name}, possible safety block.")
                    break # 다음 모델로

                try:
                    return _parse_json_or_raise(resp.text)
                except ValueError as ve:
                    if attempt == 0:
<<<<<<< HEAD
                        print(f"JSON Parsing failed for {model_name}, retrying...")
                        time.sleep(1)
                        continue
                    raise ve
=======
                        continue
                    raise
            except anthropic.NotFoundError as e:
                last_err = e
                break
            except ValueError:
                raise
>>>>>>> bc1b2e96a9e6372f937d1643bcb7db5ae6c82540
            except Exception as e:
                last_err = e
                err_msg = str(e)
                print(f"Gemini Error ({model_name}): {err_msg}")
                
                if "429" in err_msg:
                    print(f"Rate limit (429) hit for {model_name}. Waiting 5 seconds...")
                    time.sleep(5)
                    break # 다음 모델 시도 (또는 재시도)
                
                if attempt == 0:
                    time.sleep(2)
                    continue
                break
                
    if last_err:
        raise last_err
<<<<<<< HEAD
    raise ValueError("Gemini 호출에 실패했습니다.")
=======
    raise ValueError("Claude 호출에 실패했습니다.")


def generate_linkedin(raw_content: str) -> dict[str, Any]:
    result = _call_claude(
        LINKEDIN_PROMPT.format(raw_content=raw_content, json_only=_JSON_ONLY),
        max_tokens=1500,
    )
    result["char_count"] = len(result.get("post", ""))
    result["estimated_reach"] = "HIGH" if result.get("viral_score", 0) >= 80 else "MEDIUM"
    return result


def generate_twitter(raw_content: str) -> dict[str, Any]:
    result = _call_claude(
        TWITTER_PROMPT.format(raw_content=raw_content, json_only=_JSON_ONLY),
        max_tokens=1200,
    )
    result["estimated_reach"] = "VIRAL" if result.get("viral_score", 0) >= 85 else "HIGH"
    return result


def generate_instagram(raw_content: str) -> dict[str, Any]:
    result = _call_claude(
        INSTAGRAM_PROMPT.format(raw_content=raw_content, json_only=_JSON_ONLY),
        max_tokens=1800,
    )
    result["estimated_reach"] = "HIGH" if result.get("viral_score", 0) >= 80 else "MEDIUM"
    return result
>>>>>>> bc1b2e96a9e6372f937d1643bcb7db5ae6c82540
