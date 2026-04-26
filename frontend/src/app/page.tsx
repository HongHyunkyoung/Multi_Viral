"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ── 타입 ── */
type Step = "idle" | "extracting" | "analyzing" | "generating" | "done" | "error";
type LinkedInResult  = { post: string; hook: string; estimated_reach: string; viral_score: number; keywords: string[]; analysis: string; };
type TwitterResult   = { thread: string[]; hook: string; estimated_reach: string; viral_score: number; keywords: string[]; analysis: string; };
type InstagramResult = { caption: string; hashtags: string[]; hook: string; estimated_reach: string; viral_score: number; keywords: string[]; carousel_slides: string[]; analysis: string; };
export type GenerateResponse = {
  cache_hit: boolean; source_type: string; title: string;
  platform_posts: { linkedin: LinkedInResult; twitter: TwitterResult; instagram: InstagramResult; };
  processing_time_ms: number;
};

/* ── 유틸 ── */
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function clean(t: string)  { return t.replace(/_{3,}/gm, "").replace(/-{5,}/gm, "").replace(/\n{3,}/g, "\n\n").trim(); }

/* ── 복사 버튼 ── */
function CopyBtn({ text }: { text: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  async function go() {
    await navigator.clipboard.writeText(text);
    const el = ref.current; if (!el) return;
    el.textContent = "✓";
    el.classList.add("!text-cyan-400");
    setTimeout(() => { if (ref.current) { ref.current.textContent = "⎘"; ref.current.classList.remove("!text-cyan-400"); } }, 2000);
  }
  return (
    <button ref={ref} onClick={go} type="button"
      className="text-base text-white/30 hover:text-white/80 transition-colors leading-none" title="복사">
      ⎘
    </button>
  );
}

/* ── 네온 VIRAL SCORE 배지 ── */
function ViralBadge({ score }: { score: number }) {
  const color = score >= 80 ? "rgba(0,255,200,1)" : score >= 65 ? "rgba(0,220,255,1)" : "rgba(180,180,220,1)";
  return (
    <div className="flex flex-col items-end gap-0.5"
      style={{ filter: `drop-shadow(0 0 8px ${color}40)` }}>
      <span className="text-[10px] font-black tracking-[0.2em] opacity-60" style={{ color }}>VIRAL SCORE</span>
      <span className="text-3xl font-black leading-none neon-cyan" style={{ color }}>{score}</span>
    </div>
  );
}

/* ── 스켈레톤 카드 ── */
function SkeletonCard({ delay = 0, tall = false }: { delay?: number; tall?: boolean }) {
  return (
    <div className="glass-card rounded-2xl overflow-hidden spring-card"
      style={{ animationDelay: `${delay}ms` }}>
      <div className="skeleton h-0.5 w-full" />
      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between">
          <div className="skeleton h-10 w-10 rounded-xl" />
          <div className="skeleton h-8 w-16 rounded-lg" />
        </div>
        <div className="space-y-2">
          <div className="skeleton h-3 w-full rounded" />
          <div className="skeleton h-3 w-5/6 rounded" />
          <div className="skeleton h-3 w-4/6 rounded" />
          {tall && <>
            <div className="skeleton h-3 w-full rounded mt-3" />
            <div className="skeleton h-3 w-3/4 rounded" />
            <div className="skeleton h-3 w-5/6 rounded" />
          </>}
        </div>
        <div className="flex gap-2 pt-2">
          {[60,80,50].map((w,i) => <div key={i} className="skeleton h-5 rounded-full" style={{ width: w }} />)}
        </div>
      </div>
    </div>
  );
}

/* ── 플랫폼 카드 ── */
function PlatformCard({
  platform, viralScore, keywords, analysis, bodyText, extra, animDelay,
}: {
  platform: "linkedin" | "twitter" | "instagram";
  viralScore: number; keywords: string[]; analysis: string;
  bodyText: string; extra?: React.ReactNode; animDelay: number;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(() => clean(bodyText));
  const display = editing ? editText : clean(bodyText);

  /* 플랫폼별 설정 */
  const cfg = {
    linkedin: {
      topBar: "bg-[#0077B5]",
      logoEl: (
        <div className="h-12 w-12 rounded-xl flex items-center justify-center text-white font-black text-xl"
          style={{ background: "linear-gradient(135deg,#0077B5,#00a0dc)" }}>
          in
        </div>
      ),
      name: "LinkedIn",
      nameColor: "text-[#0077B5]",
    },
    twitter: {
      topBar: "bg-white",
      logoEl: (
        <div className="h-12 w-12 rounded-xl flex items-center justify-center bg-black border border-white/20 text-white font-black text-2xl">
          𝕏
        </div>
      ),
      name: "X (Twitter)",
      nameColor: "text-white",
    },
    instagram: {
      topBarStyle: { background: "linear-gradient(90deg,#833AB4,#FD1D1D,#F56040)" } as React.CSSProperties,
      logoEl: (
        <div className="h-12 w-12 rounded-xl flex items-center justify-center text-white font-black text-xl"
          style={{ background: "linear-gradient(135deg,#833AB4,#FD1D1D,#F56040)" }}>
          ◎
        </div>
      ),
      name: "Instagram",
      nameColor: "text-transparent bg-clip-text",
      nameStyle: { backgroundImage: "linear-gradient(90deg,#c13584,#e1306c,#f56040)" },
    },
  }[platform];

  return (
    <div
      className="glass-card rounded-2xl overflow-hidden spring-card break-inside-avoid"
      style={{ animationDelay: `${animDelay}ms` }}
    >
      {/* 상단 플랫폼 컬러 라인 */}
      {platform === "instagram"
        ? <div className="h-[3px] w-full" style={cfg.topBarStyle} />
        : <div className={`h-[3px] w-full ${cfg.topBar}`} />
      }

      {/* 카드 헤더 */}
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {cfg.logoEl}
          <div className="pt-1">
            <div className={`text-sm font-black ${cfg.nameColor}`}
              style={(cfg as any).nameStyle}>
              {cfg.name}
            </div>
            <div className="text-[11px] text-white/40 mt-0.5 font-medium">
              AI Generated Post
            </div>
          </div>
        </div>
        <ViralBadge score={viralScore} />
      </div>

      {/* 본문 */}
      <div className="px-5 pb-4">
        {editing
          ? <textarea value={editText} onChange={(e) => setEditText(e.target.value)}
              rows={10}
              className="w-full resize-y rounded-xl p-3 text-sm leading-7 text-white/90 font-sans outline-none transition-all"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }} />
          : <pre className="whitespace-pre-wrap break-words text-sm leading-7 text-white/80 font-sans">{display}</pre>
        }
        {extra && !editing && <div className="mt-4">{extra}</div>}
      </div>

      {/* 하단 바 */}
      <div className="px-5 py-4 border-t border-white/[0.06]">
        {/* 키워드 */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(keywords || []).slice(0, 7).map((k) => (
            <span key={k}
              className="text-[11px] px-2.5 py-1 rounded-full font-medium"
              style={{ background: "rgba(0,255,255,0.07)", color: "rgba(0,220,255,0.8)", border: "1px solid rgba(0,220,255,0.15)" }}>
              {k}
            </span>
          ))}
        </div>

        {/* AI 분석 */}
        <div className="flex items-start gap-2 mb-3">
          <span className="shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded mt-0.5 text-black"
            style={{ background: "rgba(0,255,255,0.85)" }}>
            AI
          </span>
          <p className="text-[11px] text-white/40 leading-5">{analysis}</p>
        </div>

        {/* 액션 버튼 */}
        <div className="flex items-center justify-between">
          <CopyBtn text={display} />
          <button type="button" onClick={() => setEditing((v) => !v)}
            className="text-[11px] font-medium px-3 py-1.5 rounded-lg transition-all"
            style={editing
              ? { background: "rgba(0,255,200,0.12)", color: "rgba(0,255,200,0.9)", border: "1px solid rgba(0,255,200,0.25)" }
              : { background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.09)" }
            }>
            {editing ? "✓ 완료" : "✏ 수정"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 메인 ── */
export default function Page() {
  const [url, setUrl]           = useState("");
  const [step, setStep]         = useState<Step>("idle");
  const [results, setResults]   = useState<GenerateResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const finalizeRef = useRef<number | null>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const inputRef    = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (finalizeRef.current) window.clearTimeout(finalizeRef.current);
    abortRef.current?.abort();
  }, []);

  const apiBase   = useMemo(() => process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000", []);
  const isLoading = step !== "idle" && step !== "done" && step !== "error";

  async function onGenerate() {
    const t = url.trim();
    if (!t) { inputRef.current?.focus(); return; }
    if (finalizeRef.current) window.clearTimeout(finalizeRef.current);
    abortRef.current?.abort();
    setErrorMsg(""); setResults(null); setStep("extracting");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await sleep(400); setStep("analyzing");
      await sleep(400); setStep("generating");
      const res  = await fetch(`${apiBase}/api/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: t }), signal: ctrl.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) { setErrorMsg(data?.detail?.message || "요청에 실패했습니다."); setStep("error"); return; }
      setResults(data as GenerateResponse);
      finalizeRef.current = window.setTimeout(() => setStep("done"), 1800);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setErrorMsg("요청 중 오류가 발생했습니다."); setStep("error");
    }
  }

  async function onPaste() {
    try { setUrl(await navigator.clipboard.readText()); }
    catch { /* 직접 입력 유도 */ }
  }

  function onReset() {
    if (finalizeRef.current) window.clearTimeout(finalizeRef.current);
    abortRef.current?.abort();
    setResults(null); setErrorMsg(""); setStep("idle");
  }

  const li  = results?.platform_posts.linkedin?.viral_score  ?? 0;
  const tw  = results?.platform_posts.twitter?.viral_score   ?? 0;
  const ig  = results?.platform_posts.instagram?.viral_score ?? 0;

  const statusText = {
    idle:       null,
    extracting: "URL 분석 중...",
    analyzing:  "인사이트 추출 중...",
    generating: "콘텐츠 생성 중...",
    done:       null,
    error:      null,
  }[step];

  const chips = [
    { label: "YouTube 영상", url: "https://www.youtube.com/watch?v=ppNDyXwXwRU" },
    { label: "기술 블로그",  url: "https://velog.io/" },
    { label: "뉴스레터",     url: "https://www.carrotglobalblog.com/s-company-pharmaceutical-researcher-custom-english-language-lab-260423/" },
  ] as const;

  return (
    <div className="min-h-dvh" style={{ background: "#050505" }}>

      {/* ══ STICKY HEADER — 얇고 세련된 입력창 ══ */}
      <header className="sticky top-0 z-30"
        style={{ background: "rgba(5,5,5,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="mx-auto max-w-7xl px-4 h-12 flex items-center gap-3">

          {/* 로고 */}
          <div className="flex items-center gap-2 shrink-0 mr-1">
            <div className="h-6 w-6 rounded-md grid place-items-center"
              style={{ background: "rgba(0,255,255,0.9)" }}>
              <span className="text-black text-[10px] font-black">M</span>
            </div>
            <span className="text-xs font-black text-white/80 tracking-wider hidden sm:block">MULTI VIRAL</span>
          </div>

          {/* URL 입력창 */}
          <div className="flex-1 flex items-center gap-1.5 px-3 h-8 rounded-lg"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <svg className="w-3 h-3 shrink-0" style={{ color: "rgba(255,255,255,0.25)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
            </svg>
            <input
              ref={inputRef}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onGenerate()}
              placeholder="YouTube URL 또는 블로그 주소를 입력하세요"
              className="w-full bg-transparent outline-none text-xs text-white/80 placeholder:text-white/20"
            />
            {url && (
              <button onClick={() => setUrl("")} className="text-white/20 hover:text-white/60 text-sm leading-none transition-colors shrink-0">✕</button>
            )}
          </div>

          {/* 붙여넣기 */}
          <button onClick={onPaste} type="button"
            className="text-[11px] font-medium px-2.5 h-8 rounded-lg shrink-0 transition-all hidden sm:flex items-center gap-1"
            style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.07)" }}>
            📋
          </button>

          {/* 생성 / 상태 */}
          {isLoading ? (
            <div className="flex items-center gap-2 shrink-0">
              <div className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "rgba(0,255,200,0.9)" }} />
              <span className="text-[11px] font-bold hidden sm:block" style={{ color: "rgba(0,255,200,0.8)" }}>{statusText}</span>
            </div>
          ) : step === "done" ? (
            <button onClick={onReset} type="button"
              className="text-[11px] font-black px-3 h-8 rounded-lg shrink-0 transition-all"
              style={{ background: "rgba(0,255,255,0.12)", color: "rgba(0,255,255,0.9)", border: "1px solid rgba(0,255,255,0.2)" }}>
              + 새 URL
            </button>
          ) : (
            <button onClick={onGenerate} type="button"
              className="text-xs font-black px-4 h-8 rounded-lg shrink-0 transition-all"
              style={{ background: "rgba(0,255,255,0.9)", color: "#000" }}>
              분석 →
            </button>
          )}
        </div>
      </header>

      {/* ══ IDLE — 최소화된 웰컴 ══ */}
      {step === "idle" && (
        <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-48px)] px-4 pb-8">
          <div className="text-center mb-10">
            <div className="text-[11px] font-black tracking-[0.3em] mb-4"
              style={{ color: "rgba(0,255,255,0.5)" }}>
              AI-POWERED VIRAL CONTENT ENGINE
            </div>
            <h1 className="text-4xl sm:text-6xl font-black text-white tracking-tight mb-4">
              URL 하나로<br />
              <span style={{ color: "rgba(0,255,255,0.9)", textShadow: "0 0 40px rgba(0,255,255,0.4)" }}>
                3개 플랫폼
              </span>
              을 동시에
            </h1>
            <p className="text-sm text-white/30 max-w-md mx-auto leading-relaxed">
              상단 입력창에 URL을 붙여넣고 Enter를 누르세요<br />
              LinkedIn · X · Instagram 콘텐츠가 즉시 생성됩니다
            </p>
          </div>

          {/* 예시 칩 */}
          <div className="flex flex-wrap items-center justify-center gap-2 mb-12">
            <span className="text-[11px] text-white/20">예시 URL:</span>
            {chips.map((c) => (
              <button key={c.label} onClick={() => { setUrl(c.url); inputRef.current?.focus(); }} type="button"
                className="text-[11px] px-3 py-1.5 rounded-full transition-all"
                style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
                {c.label}
              </button>
            ))}
          </div>

          {/* 통계 */}
          <div className="grid grid-cols-3 gap-8 text-center">
            {[
              { n: "3",    sub: "플랫폼 동시 생성" },
              { n: "~60s", sub: "평균 생성 시간"   },
              { n: "AI",   sub: "Claude 기반"      },
            ].map(({ n, sub }) => (
              <div key={sub}>
                <div className="text-2xl sm:text-3xl font-black mb-1"
                  style={{ color: "rgba(0,255,255,0.8)", textShadow: "0 0 20px rgba(0,255,255,0.3)" }}>
                  {n}
                </div>
                <div className="text-[11px] text-white/25 font-medium">{sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ LOADING — 스켈레톤 Masonry ══ */}
      {isLoading && (
        <div className="px-4 sm:px-5 py-6 mx-auto max-w-7xl">
          {/* 상태 텍스트 */}
          <div className="flex items-center gap-2 mb-6 px-1">
            <div className="h-2 w-2 rounded-full animate-pulse" style={{ background: "rgba(0,255,200,1)" }} />
            <span className="text-sm font-bold" style={{ color: "rgba(0,255,200,0.8)" }}>{statusText}</span>
            <span className="text-xs text-white/25 ml-1 truncate">{url}</span>
          </div>

          {/* 스켈레톤 마소니 그리드 */}
          <div className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-4">
            <SkeletonCard delay={0}   tall={true}  />
            <SkeletonCard delay={90}  tall={false} />
            <SkeletonCard delay={180} tall={true}  />
          </div>
        </div>
      )}

      {/* ══ ERROR ══ */}
      {step === "error" && (
        <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-48px)] px-4 text-center">
          <div className="text-5xl mb-5">⚠</div>
          <h2 className="text-xl font-black text-white mb-2">오류가 발생했어요</h2>
          <p className="text-sm text-white/40 mb-6 max-w-sm">{errorMsg || "잠시 후 다시 시도해주세요."}</p>
          <div className="flex gap-3">
            <button onClick={onReset} type="button"
              className="h-9 px-5 rounded-xl text-sm font-black text-black transition-colors"
              style={{ background: "rgba(0,255,255,0.9)" }}>
              새 URL 입력
            </button>
            <button onClick={onGenerate} type="button"
              className="h-9 px-5 rounded-xl text-sm font-semibold text-white/60 transition-colors"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
              재시도
            </button>
          </div>
        </div>
      )}

      {/* ══ DONE — MASONRY SOCIAL WALL ══ */}
      {(step === "done" || (step === "generating" && results)) && results && (
        <div className="px-4 sm:px-5 py-5 mx-auto max-w-7xl">

          {/* 분석 완료 상단 바 */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5 px-1">
            <div className="flex items-center gap-3">
              <span className={["text-[11px] font-black px-2.5 py-1 rounded-full",
                results.source_type === "youtube"
                  ? "bg-red-500/20 text-red-400 border border-red-500/25"
                  : "bg-sky-500/20 text-sky-400 border border-sky-500/25",
              ].join(" ")}>
                {results.source_type === "youtube" ? "▶ YOUTUBE" : "✍ BLOG"}
              </span>
              <span className="text-sm font-bold text-white/70 truncate max-w-xs sm:max-w-lg">
                {results.title || url}
              </span>
              <span className="text-[11px] text-white/25">
                {(results.processing_time_ms / 1000).toFixed(1)}s
              </span>
            </div>
            <div className="flex items-center gap-4">
              {[
                { label: "LI", score: li  },
                { label: "X",  score: tw  },
                { label: "IG", score: ig  },
              ].map(({ label, score }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="text-[10px] text-white/30 font-bold">{label}</span>
                  <span className="text-sm font-black neon-cyan" style={{ color: "rgba(0,255,200,0.9)" }}>{score}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ★ MASONRY SOCIAL WALL — 탭 없음, 3개 카드 동시 표시 ★ */}
          <div className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-4">

            {/* LinkedIn */}
            <PlatformCard
              platform="linkedin" animDelay={0}
              viralScore={results.platform_posts.linkedin.viral_score}
              keywords={results.platform_posts.linkedin.keywords}
              analysis={results.platform_posts.linkedin.analysis}
              bodyText={results.platform_posts.linkedin.post}
            />

            {/* X (Twitter) */}
            <PlatformCard
              platform="twitter" animDelay={90}
              viralScore={results.platform_posts.twitter.viral_score}
              keywords={results.platform_posts.twitter.keywords}
              analysis={results.platform_posts.twitter.analysis}
              bodyText={results.platform_posts.twitter.thread.join("\n\n")}
            />

            {/* Instagram */}
            <PlatformCard
              platform="instagram" animDelay={180}
              viralScore={results.platform_posts.instagram.viral_score}
              keywords={results.platform_posts.instagram.keywords}
              analysis={results.platform_posts.instagram.analysis}
              bodyText={[
                results.platform_posts.instagram.caption, "",
                ...(results.platform_posts.instagram.hashtags || []),
              ].join("\n")}
              extra={
                <div>
                  <div className="text-[10px] font-black tracking-widest mb-2.5"
                    style={{ color: "rgba(255,255,255,0.2)" }}>
                    CAROUSEL SLIDES
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(results.platform_posts.instagram.carousel_slides || []).slice(0, 5).map((t, i) => (
                      <div key={i} className="rounded-xl p-3"
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <div className="text-[9px] font-black tracking-widest mb-1.5"
                          style={{ color: "rgba(0,255,255,0.5)" }}>
                          SLIDE {i + 1}
                        </div>
                        <div className="text-[11px] text-white/60 leading-5 break-words">{t}</div>
                      </div>
                    ))}
                  </div>
                </div>
              }
            />
          </div>
        </div>
      )}

      {/* ══ 푸터 ══ */}
      <footer className="mt-16 py-5 px-5" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="mx-auto max-w-7xl flex items-center justify-between text-[11px]"
          style={{ color: "rgba(255,255,255,0.15)" }}>
          <span>MULTI VIRAL — AI VIRAL CONTENT ENGINE</span>
          <span className="font-mono">{apiBase}</span>
        </div>
      </footer>
    </div>
  );
}
