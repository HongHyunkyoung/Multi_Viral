# Multi Viral — SNS 콘텐츠 자동 생성

URL 하나를 입력하면 LinkedIn · X · Instagram에 최적화된 바이럴 콘텐츠를 자동으로 생성합니다.  
CMUX × AIM 해커톤 단독 기획·설계·개발·배포 프로젝트입니다.

🔗 [multi-viral.vercel.app](https://multi-viral.vercel.app)

---

## 왜 만들었나

마케터·크리에이터가 같은 내용을 플랫폼마다 따로 써야 하는 반복 작업을 없애고 싶었습니다.  
단순 요약이 아니라, 각 플랫폼의 알고리즘 특성을 반영한 콘텐츠를 생성하는 것이 핵심 목표였습니다.

---

## 동작 방식

```
URL 입력
  │
  ▼
콘텐츠 추출
  ├── YouTube URL → 자막 텍스트 추출 (youtube-transcript-api)
  └── Blog URL   → 본문 텍스트 추출 (newspaper3k)
  │
  ▼
[Step 1] 콘텐츠 분석 (Gemini API)
  핵심 인사이트 · 감정 훅 · 타겟 페르소나 · 플랫폼 적합도 점수 추출
  │
  ▼
[Step 2] 플랫폼별 콘텐츠 생성 (Gemini API)
  ├── LinkedIn 포스트 (체류시간 기반 최적화)
  ├── X 스레드 (북마크 가중치 기반 최적화)
  └── Instagram 캡션 (저장율 기반 최적화)
```

---

## 플랫폼별 알고리즘 전략

단순히 "LinkedIn용으로 써줘"가 아니라, 각 플랫폼의 노출 메커니즘을 프롬프트에 직접 반영했습니다.

### LinkedIn
- 첫 3줄에서 "더 보기"를 유도해야 체류시간이 올라가고 도달 범위가 확대됨
- 1,200~1,500자 분량, 개인 스토리 + 인사이트 구조
- 프롬프트에 `체류 시간, 후킹 강도` 기반 최적화 기준을 명시

### X (Twitter)
- 좋아요보다 북마크 수가 알고리즘 가중치 2~3배 높음
- 외부 링크 포함 시 도달 70% 감소 → 링크 배제 전략
- 프롬프트에 `북마크 유도, 논쟁성, 간결성` 기준을 명시

### Instagram
- 저장(Save) 수가 가장 높은 알고리즘 가중치
- 캡션 첫 125자에 저장 유도 문구 배치
- 프롬프트에 `저장율, 시각적 정보량` 기준을 명시

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Backend | FastAPI, Python |
| AI | Gemini 2.5 Flash API |
| 콘텐츠 추출 | youtube-transcript-api, newspaper3k |
| Frontend | Next.js, TypeScript |
| 배포 | Vercel |

---

## 한계

- YouTube 자막이 없는 영상은 처리 불가
- 블로그 본문을 4,000자로 잘라 넘기기 때문에 긴 글은 후반부가 누락됨
- Viral Score는 LLM이 자체 생성한 수치로, 실제 인게이지먼트와의 상관관계는 검증되지 않음
- 같은 URL을 넣어도 출력 품질이 매번 다를 수 있음 (프롬프트 의존적)

---

## 로컬 실행

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt

# .env 파일 생성
# GEMINI_API_KEY_1=your_key_here

uvicorn main:app --reload --port 8000

# Frontend (새 터미널)
cd frontend
npm install
npm run dev  # http://localhost:3000
```
