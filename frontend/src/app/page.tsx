"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ── 타입 ── */
type Step = "idle" | "extracting" | "analyzing" | "generating" | "done" | "error";

type LinkedInResult = {
  post: string; hook: string;
  estimated_reach: "HIGH" | "MEDIUM" | string;
  char_count?: number; viral_score: number;
  keywords: string[]; analysis: string;
};
type TwitterResult = {
  thread: string[]; hook: string;
  estimated_reach: "VIRAL" | "HIGH" | string;
  viral_score: number; keywords: string[]; analysis: string;
};
type InstagramResult = {
  caption: string; hashtags: string[]; hook: string;
  estimated_reach: "HIGH" | "MEDIUM" | string;
  viral_score: number; keywords: string[];
  carousel_slides: string[]; analysis: string;
};
export type GenerateResponse = {
  cache_hit: boolean; source_type: "youtube" | "blog" | string;
  title: string;
  platform_posts: { linkedin: LinkedInResult; twitter: TwitterResult; instagram: InstagramResult; };
  processing_time_ms: number;
};

/* ── 유틸 ── */
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

/** AI 텍스트에서 지저분한 구분선(___, ---) 제거 */
function cleanAIText(text: string): string {
  return text
    .replace(/_{3,}/gm, "")
    .replace(/\-{5,}/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 바이럴 점수 → 3가지 세부 지표 (결정론적 파생) */
function scoreBreakdown(score: number) {
  return [
    { label: "키워드 최적화", value: Math.min(100, Math.round(score * 1.06)) },
    { label: "문장 흡입력",   value: Math.min(100, Math.round(score * 0.97)) },
    { label: "CTA 효과",      value: Math.min(100, Math.round(score * 0.90)) },
  ];
}

function scoreGaugeColor(score: number) {
  if (score >= 80) return "#10b981";
  if (score >= 65) return "#6366f1";
  return "#94a3b8";
}
function scoreBadgeClass(score: number) {
  if (score >= 80) return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  if (score >= 65) return "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200";
  return "bg-slate-100 text-slate-500 ring-1 ring-slate-200";
}
function scoreLabel(score: number) {
  if (score >= 80) return "높은 확산력";
  if (score >= 65) return "보통 확산력";
  return "기본 확산력";
}

/* ── 원형 게이지 ── */
function CircularScore({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const dim = size === "lg" ? 64 : size === "sm" ? 40 : 52;
  const r = dim / 2 - 5;
  const circ = 2 * Math.PI * r;
  const progress = (Math.min(100, Math.max(0, score)) / 100) * circ;
  const color = scoreGaugeColor(score);
  const textSize = size === "lg" ? "text-base" : size === "sm" ? "text-[10px]" : "text-xs";
  return (
    <div className="relative shrink-0" style={{ width: dim, height: dim }}>
      <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${dim} ${dim}`}>
        <circle cx={dim/2} cy={dim/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="4" />
        <circle cx={dim/2} cy={dim/2} r={r} fill="none" stroke={color} strokeWidth="4"
          strokeDasharray={`${progress} ${circ}`} strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.7s ease" }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`${textSize} font-bold text-slate-900`}>{score}</span>
      </div>
    </div>
  );
}

/* ── 점수 세부 지표 바 ── */
function ScoreBreakdown({ score }: { score: number }) {
  const items = scoreBreakdown(score);
  return (
    <div className="mt-4 pt-4 border-t border-slate-100 space-y-2.5">
      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">점수 근거</div>
      {items.map(({ label, value }) => (
        <div key={label}>
          <div className="flex justify-between mb-1">
            <span className="text-xs text-slate-600">{label}</span>
            <span className="text-xs font-semibold text-slate-700">{value}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${value}%`,
                backgroundColor: scoreGaugeColor(value),
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── 복사 버튼 ── */
function CopyButton({ text }: { text: string }) {
  const btnRef = useRef<HTMLButtonElement | null>(null);
  async function onCopy() {
    await navigator.clipboard.writeText(text);
    const el = btnRef.current;
    if (!el) return;
    el.textContent = "✓ 복사됨";
    el.classList.add("!bg-emerald-500", "!text-white", "!border-emerald-500");
    window.setTimeout(() => {
      if (!btnRef.current) return;
      btnRef.current.textContent = "복사";
      btnRef.current.classList.remove("!bg-emerald-500", "!text-white", "!border-emerald-500");
    }, 2000);
  }
  return (
    <button ref={btnRef} type="button" onClick={onCopy}
      className="text-xs px-3 py-1.5 rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-all font-medium">
      복사
    </button>
  );
}

/* ── 플랫폼 설정 ── */
const PLATFORM_CONFIG = {
  linkedin:  { bar: "bg-sky-600",   iconBg: "bg-sky-600",   icon: "in", label: "LinkedIn" },
  twitter:   { bar: "bg-slate-900", iconBg: "bg-slate-900", icon: "𝕏",  label: "X (Twitter)" },
  instagram: { bar: "bg-gradient-to-r from-violet-500 via-pink-500 to-orange-400",
               iconBg: "bg-gradient-to-br from-violet-500 via-pink-500 to-orange-400", icon: "◎", label: "Instagram" },
} as const;

/* ── 플랫폼 카드 (편집 모드 포함) ── */
function PlatformCard({
  platform, reach, viralScore, keywords, analysis, bodyText, extra,
}: {
  platform: "linkedin" | "twitter" | "instagram";
  reach: string; viralScore: number; keywords: string[];
  analysis: string; bodyText: string; extra?: React.ReactNode;
}) {
  const cfg = PLATFORM_CONFIG[platform];
  const cleaned = cleanAIText(bodyText);
  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(cleaned);

  // 새로운 결과가 들어오면 편집 중인 텍스트 초기화
  useEffect(() => {
    setEditedText(cleaned);
  }, [cleaned]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* 컬러 상단 바 */}
      <div className={`h-1 w-full ${cfg.bar}`} />

      {/* 카드 헤더 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className={`h-8 w-8 rounded-xl ${cfg.iconBg} text-white grid place-items-center text-sm font-bold shrink-0`}>
            {cfg.icon}
          </div>
          <div>
            <div className="font-semibold text-slate-900 text-sm">{cfg.label}</div>
            <div className={["inline-flex items-center gap-1 text-[11px] font-medium mt-0.5",
              reach === "VIRAL" ? "text-emerald-600" : "text-indigo-600"].join(" ")}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${reach === "VIRAL" ? "bg-emerald-500" : "bg-indigo-500"}`} />
              {reach === "VIRAL" ? "바이럴 예상" : reach === "HIGH" ? "높은 도달 예상" : "도달 예상"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsEditing((v) => !v)}
            className={["text-xs px-3 py-1.5 rounded-full border font-medium transition-all",
              isEditing
                ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
                : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100",
            ].join(" ")}
          >
            {isEditing ? "✓ 완료" : "✏️ 수정"}
          </button>
          <CopyButton text={editedText} />
        </div>
      </div>

      {/* 본문 */}
      <div className="px-5 py-5">
        {isEditing ? (
          <textarea
            value={editedText}
            onChange={(e) => setEditedText(e.target.value)}
            className="w-full min-h-[200px] resize-y rounded-xl border border-indigo-200 bg-indigo-50/30 p-3 text-sm leading-7 text-slate-800 outline-none focus:ring-2 focus:ring-indigo-300 transition-all font-sans"
          />
        ) : (
          <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-800 font-sans">{editedText}</pre>
        )}

        {extra && !isEditing ? <div className="mt-5">{extra}</div> : null}
      </div>

      {/* 하단 — 게이지 + 세부 지표 + 키워드 */}
      <div className="px-5 py-5 bg-slate-50 border-t border-slate-100">
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* 원형 게이지 + 점수 근거 */}
          <div className="min-w-[160px]">
            <div className="flex items-center gap-3">
              <CircularScore score={viralScore} size="md" />
              <div>
                <div className="text-xs font-semibold text-slate-700">바이럴 점수</div>
                <span className={["text-[11px] mt-0.5 font-medium px-2 py-0.5 rounded-full inline-block", scoreBadgeClass(viralScore)].join(" ")}>
                  {scoreLabel(viralScore)}
                </span>
              </div>
            </div>
            <ScoreBreakdown score={viralScore} />
          </div>

          {/* 키워드 */}
          <div className="flex flex-wrap gap-1.5 justify-end max-w-[240px]">
            {(keywords || []).slice(0, 8).map((k) => (
              <span key={k} className="text-[11px] px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100 font-medium">
                {k}
              </span>
            ))}
          </div>
        </div>

        {/* AI 분석 */}
        <div className="mt-4 pt-4 border-t border-slate-200">
          <div className="flex items-start gap-2">
            <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-600 text-white mt-0.5">AI 분석</span>
            <p className="text-xs text-slate-600 leading-5">{analysis}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 결과 대시보드 (상단 요약) ── */
function ResultDashboard({
  results, url,
}: {
  results: GenerateResponse; url: string;
}) {
  const { linkedin, twitter, instagram } = results.platform_posts;
  const avgScore = Math.round((linkedin.viral_score + twitter.viral_score + instagram.viral_score) / 3);

  // 전체 키워드 풀 (중복 제거)
  const allKeywords = Array.from(new Set([
    ...(linkedin.keywords || []),
    ...(twitter.keywords || []),
    ...(instagram.keywords || []),
  ])).slice(0, 10);

  const platformScores = [
    { label: "LinkedIn", score: linkedin.viral_score, color: "bg-sky-500" },
    { label: "X",        score: twitter.viral_score,  color: "bg-slate-800" },
    { label: "Instagram",score: instagram.viral_score, color: "bg-pink-500" },
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-5">
      {/* 헤더: 제목 + 소스 정보 */}
      <div className="px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-white">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={["text-[11px] font-bold px-2.5 py-0.5 rounded-full",
                results.source_type === "youtube"
                  ? "bg-red-50 text-red-600 border border-red-200"
                  : "bg-sky-50 text-sky-600 border border-sky-200",
              ].join(" ")}>
                {results.source_type === "youtube" ? "▶ YouTube" : "📝 Blog"}
              </span>
              {results.cache_hit && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                  캐시
                </span>
              )}
              <span className="text-[11px] text-slate-400">{(results.processing_time_ms / 1000).toFixed(1)}s 소요</span>
            </div>
            <h2 className="text-base font-bold text-slate-900 truncate">{results.title || url}</h2>
            <p className="text-xs text-slate-400 mt-0.5 truncate">{url}</p>
          </div>
        </div>
      </div>

      {/* 분석 요약 본문 */}
      <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-3 gap-5">
        {/* 평균 바이럴 점수 */}
        <div className="flex items-center gap-4">
          <CircularScore score={avgScore} size="lg" />
          <div>
            <div className="text-xs text-slate-500 mb-0.5">평균 바이럴 점수</div>
            <div className="text-2xl font-extrabold text-slate-900">{avgScore}</div>
            <span className={["text-[11px] px-2 py-0.5 rounded-full font-medium", scoreBadgeClass(avgScore)].join(" ")}>
              {scoreLabel(avgScore)}
            </span>
          </div>
        </div>

        {/* 플랫폼별 점수 바 */}
        <div className="space-y-2.5">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">플랫폼별 점수</div>
          {platformScores.map(({ label, score, color }) => (
            <div key={label}>
              <div className="flex justify-between mb-1">
                <span className="text-xs text-slate-600 font-medium">{label}</span>
                <span className="text-xs font-bold text-slate-800">{score}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${score}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* 핵심 키워드 */}
        <div>
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">핵심 키워드</div>
          <div className="flex flex-wrap gap-1.5">
            {allKeywords.map((k) => (
              <span key={k} className="text-[11px] px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100 font-medium">
                {k}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 로딩 박스 ── */
function LoadingBox({ step, hasResults }: { step: Step; hasResults: boolean }) {
  const steps = [
    { n: 1, label: "콘텐츠 추출 중",
      state: step === "extracting" ? "active" : (step === "analyzing" || step === "generating") ? "done" : "pending" },
    { n: 2, label: "핵심 인사이트 분석 중",
      state: step === "analyzing" ? "active" : step === "generating" ? "done" : "pending" },
    { n: 3, label: "3개 플랫폼 콘텐츠 생성 중",
      state: (step === "generating" && !hasResults) ? "active" : hasResults ? "done" : "pending" },
    { n: 4, label: "바이럴 점수 계산 중",
      state: (step === "generating" && hasResults) ? "active" : "pending" },
  ] as const;

  const doneCount = steps.filter((s) => s.state === "done").length;

  return (
    <div className="flex flex-col items-center py-10">
      <div className="relative w-16 h-16 mb-6">
        <div className="w-16 h-16 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center text-lg">✦</div>
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-1">콘텐츠를 생성하고 있어요</h3>
      <p className="text-sm text-slate-500 mb-8">평균 40~60초 정도 소요됩니다</p>
      <div className="w-full max-w-xs space-y-2">
        {steps.map(({ n, label, state }) => (
          <div key={n} className="flex items-center gap-3">
            <div className={["h-6 w-6 rounded-full grid place-items-center text-xs font-bold shrink-0 transition-colors",
              state === "done" ? "bg-emerald-500 text-white" :
              state === "active" ? "bg-indigo-600 text-white" :
              "bg-slate-100 text-slate-400"].join(" ")}>
              {state === "done" ? "✓" : n}
            </div>
            <span className={["text-sm transition-colors",
              state === "done" ? "text-slate-400 line-through" :
              state === "active" ? "text-slate-900 font-semibold" :
              "text-slate-400"].join(" ")}>
              {label}
            </span>
            {state === "active" && <div className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />}
          </div>
        ))}
      </div>
      <div className="mt-6 w-full max-w-xs h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full bg-indigo-600 transition-all duration-700"
          style={{ width: `${Math.max(10, (doneCount / steps.length) * 100)}%` }} />
      </div>
    </div>
  );
}

/* ── 메인 페이지 ── */
export default function Page() {
  const [url, setUrl]           = useState("");
  const [activeTab, setActiveTab] = useState<"linkedin" | "twitter" | "instagram">("linkedin");
  const [step, setStep]         = useState<Step>("idle");
  const [results, setResults]   = useState<GenerateResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const finalizeTimerRef = useRef<number | null>(null);
  const abortRef         = useRef<AbortController | null>(null);

  useEffect(() => () => {
    if (finalizeTimerRef.current) window.clearTimeout(finalizeTimerRef.current);
    abortRef.current?.abort();
  }, []);

  const apiBase  = useMemo(() => {
    let url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    return url.endsWith("/") ? url.slice(0, -1) : url;
  }, []);
  const isLoading = step !== "idle" && step !== "done" && step !== "error";
  const hasResultsDuringGenerating = step === "generating" && results !== null;

  async function onPaste() {
    try { setUrl(await navigator.clipboard.readText()); }
    catch { setErrorMsg("클립보드 접근이 차단되었습니다."); setStep("error"); }
  }

  async function onGenerate() {
    const trimmed = url.trim();
    if (!trimmed) { setErrorMsg("URL을 입력해주세요."); setStep("error"); return; }

    if (finalizeTimerRef.current) window.clearTimeout(finalizeTimerRef.current);
    abortRef.current?.abort();
    setErrorMsg(""); setResults(null); setStep("extracting");

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await sleep(450); setStep("analyzing");
      await sleep(450); setStep("generating");

      const res = await fetch(`${apiBase}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        let msg = "요청에 실패했습니다.";
        if (data?.detail) {
          if (typeof data.detail === "string") msg = data.detail;
          else if (data.detail.message) msg = data.detail.message;
          else if (Array.isArray(data.detail)) msg = data.detail.map((err: any) => err.msg).join(", ");
        }
        setErrorMsg(msg);
        setStep("error");
        return;
      }

      setResults(data as GenerateResponse);
      finalizeTimerRef.current = window.setTimeout(() => setStep("done"), 2000);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setErrorMsg("요청 중 오류가 발생했습니다."); setStep("error");
    }
  }

  function onNewUrl() {
    if (finalizeTimerRef.current) window.clearTimeout(finalizeTimerRef.current);
    abortRef.current?.abort();
    setResults(null); setErrorMsg(""); setStep("idle"); setActiveTab("linkedin");
  }

  const linkedinScore  = results?.platform_posts.linkedin?.viral_score  ?? 0;
  const twitterScore   = results?.platform_posts.twitter?.viral_score   ?? 0;
  const instagramScore = results?.platform_posts.instagram?.viral_score ?? 0;

  // 예시 칩 — 클릭 시 URL 자동 입력
  const exampleChips = [
    { label: "📺 YouTube 영상", url: "https://www.youtube.com/watch?v=ppNDyXwXwRU" },
    { label: "✍️ 기술 블로그",  url: "https://velog.io/" },
    { label: "📰 뉴스레터",     url: "https://www.carrotglobalblog.com/s-company-pharmaceutical-researcher-custom-english-language-lab-260423/" },
  ] as const;

  const tabs = [
    { key: "linkedin"  as const, label: "LinkedIn",  score: linkedinScore  },
    { key: "twitter"   as const, label: "X",          score: twitterScore   },
    { key: "instagram" as const, label: "Instagram",  score: instagramScore },
  ];

  return (
    <div className="min-h-dvh bg-slate-50">

      {/* ── 헤더 ── */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-5xl px-5 h-14 flex items-center justify-between">
          {/* 로고 */}
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-indigo-600 grid place-items-center">
              <span className="text-white text-xs font-black">M</span>
            </div>
            <span className="font-extrabold text-slate-900 text-sm tracking-tight">Multi Viral</span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
              Beta
            </span>
          </div>

          {/* 우측 액션 */}
          <div className="flex items-center gap-3">
            {step === "done" && results && (
              <>
                <span className="text-[11px] text-slate-400 hidden sm:inline">
                  {(results.processing_time_ms / 1000).toFixed(1)}s 소요
                </span>
                <button type="button" onClick={onNewUrl}
                  className="h-8 px-4 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-colors">
                  + 새 URL
                </button>
              </>
            )}
            {isLoading && (
              <span className="text-[11px] text-indigo-600 font-semibold animate-pulse">분석 중...</span>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10">

        {/* ── IDLE: 히어로 ── */}
        {step === "idle" && (
          <div className="flex flex-col items-center text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse inline-block" />
              AI 기반 SNS 콘텐츠 생성기
            </div>

            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight mb-4">
              URL 하나로<br />
              <span className="text-indigo-600">3개 플랫폼</span>을 공략하세요
            </h1>
            <p className="text-base text-slate-500 max-w-lg mb-10 leading-relaxed">
              YouTube 또는 블로그 URL을 입력하면<br />
              LinkedIn · X · Instagram용 바이럴 콘텐츠를 자동으로 생성합니다.
            </p>

            {/* 입력창 */}
            <div className="w-full max-w-2xl">
              <div className="flex gap-2 p-2 rounded-2xl border border-slate-200 bg-white shadow-md shadow-slate-100">
                <div className="flex-1 flex items-center gap-2 px-3">
                  <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101M14.828 14.828a4 4 0 015.656 0l.1.1" />
                  </svg>
                  <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onGenerate()}
                    placeholder="https://youtube.com/watch?v=... 또는 블로그 URL"
                    className="w-full bg-transparent outline-none text-sm text-slate-900 placeholder:text-slate-400 py-2"
                  />
                </div>
                <button type="button" onClick={onPaste}
                  className="h-10 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors shrink-0"
                  title="클립보드에서 붙여넣기">
                  📋
                </button>
                <button type="button" onClick={onGenerate}
                  className="h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors shrink-0">
                  생성하기 →
                </button>
              </div>

              {/* 예시 칩 — 클릭 시 URL 자동 입력 */}
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <span className="text-xs text-slate-400">예시:</span>
                {exampleChips.map((c) => (
                  <button key={c.label} type="button" onClick={() => setUrl(c.url)}
                    className="text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600 transition-colors">
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 기능 카드 3종 */}
            <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl text-left">
              {[
                { icon: "🔗", title: "URL 한 줄로",       desc: "YouTube, 블로그 URL만 붙여넣으면 끝" },
                { icon: "⚡", title: "평균 40~60초 완성",  desc: "AI가 인사이트 분석부터 포스팅까지" },
                { icon: "📊", title: "바이럴 점수 제공",   desc: "플랫폼별 확산 가능성을 수치로 확인" },
              ].map((f) => (
                <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-2xl mb-2">{f.icon}</div>
                  <div className="font-semibold text-slate-900 text-sm mb-1">{f.title}</div>
                  <div className="text-xs text-slate-500">{f.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── LOADING ── */}
        {isLoading && (
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100">
              <p className="text-xs text-slate-400 font-medium truncate">{url.trim()}</p>
            </div>
            <LoadingBox step={step} hasResults={hasResultsDuringGenerating} />
          </div>
        )}

        {/* ── ERROR ── */}
        {step === "error" && (
          <div className="flex flex-col items-center text-center py-16">
            <div className="text-5xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">문제가 발생했어요</h2>
            <p className="text-sm text-slate-500 mb-8 max-w-md">{errorMsg || "잠시 후 다시 시도해주세요."}</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setStep("idle")}
                className="h-10 px-5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors">
                새 URL 입력
              </button>
              <button type="button" onClick={onGenerate}
                className="h-10 px-5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors">
                같은 URL로 재시도
              </button>
            </div>
          </div>
        )}

        {/* ── DONE: 결과 ── */}
        {step === "done" && results && (
          <div>
            {/* 1. 전체 분석 리포트 대시보드 */}
            <ResultDashboard results={results} url={url.trim()} />

            {/* 2. 플랫폼별 콘텐츠 탭 */}
            <div className="flex gap-1 mb-4 bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
              {tabs.map(({ key, label, score }) => (
                <button key={key} type="button" onClick={() => setActiveTab(key)}
                  className={["flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-all",
                    activeTab === key
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-50",
                  ].join(" ")}>
                  {label}
                  <span className={["text-[10px] px-1.5 py-0.5 rounded-full font-bold",
                    activeTab === key ? "bg-white/20 text-white" : scoreBadgeClass(score),
                  ].join(" ")}>
                    {score}
                  </span>
                </button>
              ))}
            </div>

            {/* 3. 플랫폼별 콘텐츠 카드 (상태 유지를 위해 hidden 처리) */}
            <div className={activeTab !== "linkedin" ? "hidden" : "block"}>
              <PlatformCard
                platform="linkedin"
                reach={results.platform_posts.linkedin.estimated_reach}
                viralScore={results.platform_posts.linkedin.viral_score}
                keywords={results.platform_posts.linkedin.keywords}
                analysis={results.platform_posts.linkedin.analysis}
                bodyText={results.platform_posts.linkedin.post}
              />
            </div>
            <div className={activeTab !== "twitter" ? "hidden" : "block"}>
              <PlatformCard
                platform="twitter"
                reach={results.platform_posts.twitter.estimated_reach}
                viralScore={results.platform_posts.twitter.viral_score}
                keywords={results.platform_posts.twitter.keywords}
                analysis={results.platform_posts.twitter.analysis}
                bodyText={results.platform_posts.twitter.thread.join("\n\n")}
              />
            </div>
            <div className={activeTab !== "instagram" ? "hidden" : "block"}>
              <PlatformCard
                platform="instagram"
                reach={results.platform_posts.instagram.estimated_reach}
                viralScore={results.platform_posts.instagram.viral_score}
                keywords={results.platform_posts.instagram.keywords}
                analysis={results.platform_posts.instagram.analysis}
                bodyText={[
                  results.platform_posts.instagram.caption,
                  "",
                  ...(results.platform_posts.instagram.hashtags || []),
                ].join("\n")}
                extra={
                  <div>
                    <div className="text-xs font-semibold text-slate-500 mb-3">캐러셀 슬라이드 (5장)</div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {(results.platform_posts.instagram.carousel_slides || []).slice(0, 5).map((t, idx) => (
                        <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="text-[10px] font-bold text-indigo-600 mb-1">슬라이드 {idx + 1}</div>
                          <div className="text-xs text-slate-800 leading-5 break-words">{t}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                }
              />
            </div>
          </div>
        )}
      </main>

      {/* ── 푸터 ── */}
      <footer className="mt-16 border-t border-slate-200 py-6">
        <div className="mx-auto max-w-5xl px-5 flex items-center justify-between text-xs text-slate-400">
          <span>Multi Viral — AI 기반 SNS 콘텐츠 생성기</span>
          <span className="font-mono">{apiBase}</span>
        </div>
      </footer>
    </div>
  );
}
