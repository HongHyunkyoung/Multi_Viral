"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Step = "idle" | "extracting" | "analyzing" | "generating" | "done" | "error";

type LinkedInResult = {
  post: string;
  hook: string;
  estimated_reach: "HIGH" | "MEDIUM" | string;
  char_count?: number;
  viral_score: number;
  keywords: string[];
  analysis: string;
};

type TwitterResult = {
  thread: string[];
  hook: string;
  estimated_reach: "VIRAL" | "HIGH" | string;
  viral_score: number;
  keywords: string[];
  analysis: string;
};

type InstagramResult = {
  caption: string;
  hashtags: string[];
  hook: string;
  estimated_reach: "HIGH" | "MEDIUM" | string;
  viral_score: number;
  keywords: string[];
  carousel_slides: string[];
  analysis: string;
};

export type GenerateResponse = {
  cache_hit: boolean;
  source_type: "youtube" | "blog" | string;
  title: string;
  platform_posts: {
    linkedin: LinkedInResult;
    twitter: TwitterResult;
    instagram: InstagramResult;
  };
  processing_time_ms: number;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function scoreColor(score: number) {
  if (score >= 85) return "bg-emerald-600";
  if (score >= 75) return "bg-amber-500";
  return "bg-sky-600";
}

function scorePill(score: number) {
  if (score >= 85) return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
  if (score >= 75) return "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
  return "bg-sky-50 text-sky-700 ring-1 ring-sky-200";
}

function CopyButton({ text }: { text: string }) {
  const btnRef = useRef<HTMLButtonElement | null>(null);

  async function onCopy() {
    await navigator.clipboard.writeText(text);
    const el = btnRef.current;
    if (!el) return;
    el.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-200");
    el.textContent = "✓ 완료!";
    window.setTimeout(() => {
      if (!btnRef.current) return;
      btnRef.current.classList.remove("bg-emerald-50", "text-emerald-700", "border-emerald-200");
      btnRef.current.textContent = "복사";
    }, 2000);
  }

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={onCopy}
      className="text-xs px-3 py-1.5 rounded-md border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 transition-colors"
    >
      복사
    </button>
  );
}

function PlatformCard({
  platform,
  title,
  reach,
  viralScore,
  keywords,
  analysis,
  bodyText,
  extra,
}: {
  platform: "linkedin" | "twitter" | "instagram";
  title: string;
  reach: string;
  viralScore: number;
  keywords: string[];
  analysis: string;
  bodyText: string;
  extra?: React.ReactNode;
}) {
  const icon =
    platform === "linkedin" ? (
      <div className="h-6 w-6 rounded-md bg-sky-200 text-sky-900 grid place-items-center text-[11px] font-bold">
        in
      </div>
    ) : platform === "twitter" ? (
      <div className="h-6 w-6 rounded-md bg-zinc-900 text-zinc-50 grid place-items-center text-[11px] font-bold">
        X
      </div>
    ) : (
      <div className="h-6 w-6 rounded-md bg-orange-200 text-orange-900 grid place-items-center text-[11px] font-bold">
        ig
      </div>
    );

  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 border-b border-zinc-200">
        <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          {icon}
          {title}
          <span
            className={[
              "ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              reach === "VIRAL" ? "bg-emerald-100 text-emerald-800" : "bg-sky-100 text-sky-800",
            ].join(" ")}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-70" />
            {reach} 예상
          </span>
        </div>
        <CopyButton text={bodyText} />
      </div>

      <div className="px-4 py-3">
        <pre className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-900">{bodyText}</pre>

        {extra ? <div className="mt-4">{extra}</div> : null}

        <div className="mt-4 pt-3 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">바이럴 점수</span>
            <div className="h-1.5 w-24 rounded-full bg-zinc-200 overflow-hidden">
              <div className={["h-full rounded-full", scoreColor(viralScore)].join(" ")} style={{ width: `${Math.min(100, Math.max(0, viralScore))}%` }} />
            </div>
            <span className="text-sm font-semibold text-zinc-900 w-8 text-right">{viralScore}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(keywords || []).slice(0, 10).map((k) => (
              <span key={k} className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-50 text-zinc-700 border border-zinc-200">
                {k}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 py-3 bg-zinc-50 border-t border-zinc-200 text-sm text-zinc-700 leading-6">
        <span className="inline-block text-[11px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 mr-2">
          AI 분석
        </span>
        {analysis}
      </div>
    </div>
  );
}

function LoadingBox({ step, hasResults }: { step: Step; hasResults: boolean }) {
  const s1 = step === "extracting" ? "active" : step === "analyzing" || step === "generating" ? "done" : "pending";
  const s2 = step === "analyzing" ? "active" : step === "generating" ? "done" : "pending";
  const s3 = step === "generating" && !hasResults ? "active" : hasResults ? "done" : "pending";
  const s4 = step === "generating" && hasResults ? "active" : "pending";

  const Row = ({ n, label, state }: { n: number; label: string; state: "done" | "active" | "pending" }) => (
    <div className="flex items-center gap-3 py-1.5">
      <div
        className={[
          "h-6 w-6 rounded-full grid place-items-center text-xs font-semibold shrink-0",
          state === "done"
            ? "bg-emerald-200 text-emerald-900"
            : state === "active"
              ? "bg-amber-200 text-amber-900"
              : "bg-white text-zinc-400 border border-zinc-200",
        ].join(" ")}
      >
        {state === "done" ? "✓" : n}
      </div>
      <div className={["text-sm", state === "done" ? "text-zinc-500 line-through" : state === "active" ? "text-zinc-900 font-semibold" : "text-zinc-400"].join(" ")}>
        {label}
      </div>
      {state === "active" ? <div className="ml-auto h-2 w-2 rounded-full bg-amber-500 animate-pulse" /> : null}
    </div>
  );

  return (
    <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
      <Row n={1} label="콘텐츠 추출" state={s1 as any} />
      <Row n={2} label="핵심 인사이트 분석" state={s2 as any} />
      <Row n={3} label="3개 플랫폼 콘텐츠 생성" state={s3 as any} />
      <Row n={4} label="Viral Score 계산" state={s4 as any} />
      <div className="mt-3 h-1.5 rounded-full bg-zinc-200 overflow-hidden">
        <div className="h-full w-3/5 bg-amber-500 rounded-full" />
      </div>
    </div>
  );
}

export default function Page() {
  const [url, setUrl] = useState("");
  const [step, setStep] = useState<Step>("idle");
  const [results, setResults] = useState<GenerateResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const finalizeTimerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (finalizeTimerRef.current) window.clearTimeout(finalizeTimerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const apiBase = useMemo(() => process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000", []);

  const isLoading = step !== "idle" && step !== "done" && step !== "error";
  const hasResultsDuringGenerating = step === "generating" && results !== null;

  async function onPaste() {
    try {
      const t = await navigator.clipboard.readText();
      setUrl(t);
    } catch {
      setErrorMsg("클립보드 접근이 차단되었습니다. URL을 직접 붙여넣어주세요.");
      setStep("error");
    }
  }

  async function onGenerate() {
    const trimmed = url.trim();
    if (!trimmed) {
      setErrorMsg("URL을 입력해주세요.");
      setStep("error");
      return;
    }

    if (finalizeTimerRef.current) window.clearTimeout(finalizeTimerRef.current);
    abortRef.current?.abort();

    setErrorMsg("");
    setResults(null);
    setStep("extracting");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await sleep(450);
      setStep("analyzing");
      await sleep(450);
      setStep("generating");

      const res = await fetch(`${apiBase}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
        signal: controller.signal,
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = data?.detail?.message || data?.message || "요청에 실패했습니다.";
        setErrorMsg(msg);
        setStep("error");
        return;
      }

      setResults(data as GenerateResponse);
      finalizeTimerRef.current = window.setTimeout(() => {
        setStep("done");
      }, 2000);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      setErrorMsg("요청 중 오류가 발생했습니다.");
      setStep("error");
    }
  }

  function onNewUrl() {
    if (finalizeTimerRef.current) window.clearTimeout(finalizeTimerRef.current);
    abortRef.current?.abort();
    setResults(null);
    setErrorMsg("");
    setStep("idle");
  }

  const linkedinScore = results?.platform_posts.linkedin?.viral_score ?? 0;
  const twitterScore = results?.platform_posts.twitter?.viral_score ?? 0;
  const instagramScore = results?.platform_posts.instagram?.viral_score ?? 0;

  const exampleChips = [
    { label: "YouTube 영상", url: "https://www.youtube.com/watch?v=ppNDyXwXwRU" },
    { label: "기술 블로그", url: "https://velog.io/" },
    { label: "뉴스레터", url: "https://www.carrotglobalblog.com/s-company-pharmaceutical-researcher-custom-english-language-lab-260423/" },
  ] as const;

  return (
    <div className="min-h-dvh bg-zinc-50">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200 bg-white">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
              <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
              One URL, Multi-Viral
            </div>
            <div className="flex items-center gap-2">
              {step === "done" && results ? (
                <>
                  <span className="text-[11px] px-2 py-1 rounded-full bg-zinc-100 text-zinc-700 border border-zinc-200">
                    {(results.processing_time_ms / 1000).toFixed(1)}s
                  </span>
                  <button
                    type="button"
                    onClick={onNewUrl}
                    className="text-xs px-3 py-1.5 rounded-md border-2 border-sky-500 bg-sky-50 text-sky-800 font-semibold hover:bg-sky-100 transition-colors"
                  >
                    + 새 URL
                  </button>
                </>
              ) : (
                <span className="text-[11px] px-2 py-1 rounded-full bg-zinc-100 text-zinc-700 border border-zinc-200">
                  {isLoading ? "처리 중..." : "Beta"}
                </span>
              )}
            </div>
          </div>

          <div className="px-5 py-6">
            {step === "idle" ? (
              <>
                <div className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-100 mb-4">
                  입력 대기
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">URL 하나로 3개 플랫폼을 공략하세요</h1>
                <p className="mt-2 text-sm text-zinc-600">
                  YouTube 또는 블로그 URL을 입력하면 LinkedIn, X, Instagram용 바이럴 콘텐츠를 자동으로 생성합니다.
                </p>

                <div className="mt-5 flex gap-2">
                  <div className="flex-1 flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 h-10">
                    <span className="text-zinc-400">🔗</span>
                    <input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="w-full bg-transparent outline-none text-sm text-zinc-900 placeholder:text-zinc-400"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={onPaste}
                    className="h-10 px-3 rounded-md border border-zinc-200 bg-zinc-50 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 transition-colors"
                  >
                    📋 붙여넣기
                  </button>
                  <button
                    type="button"
                    onClick={onGenerate}
                    className="h-10 px-4 rounded-md bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 transition-colors"
                  >
                    ▶ 생성하기
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-zinc-400">예시:</span>
                  {exampleChips.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => setUrl(c.url)}
                      className="text-xs px-3 py-1 rounded-full border border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 transition-colors"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {isLoading ? (
              <>
                <div className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-100 mb-4">
                  생성 중
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">콘텐츠를 만들고 있어요</h2>
                <p className="mt-2 text-sm text-zinc-600 break-all">{url.trim()}</p>
                <LoadingBox step={step} hasResults={hasResultsDuringGenerating} />
              </>
            ) : null}

            {step === "error" ? (
              <>
                <div className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-100 mb-4">
                  오류
                </div>
                <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">문제가 발생했어요</h2>
                <p className="mt-2 text-sm text-zinc-600">{errorMsg || "잠시 후 다시 시도해주세요."}</p>
                <div className="mt-5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep("idle")}
                    className="h-10 px-4 rounded-md border border-sky-500 bg-sky-50 text-sky-800 text-sm font-semibold hover:bg-sky-100 transition-colors"
                  >
                    다시 입력하기
                  </button>
                </div>
              </>
            ) : null}

            {step === "done" && results ? (
              <>
                <div className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100 mb-4">
                  결과 완료
                </div>

                <div className="mb-4 flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2">
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                    {results.source_type === "youtube" ? "YouTube" : "Blog"}
                  </span>
                  <div className="text-sm text-zinc-900 flex-1 truncate">{results.title || url.trim()}</div>
                  <div className="text-[11px] text-zinc-500">{(results.processing_time_ms / 1000).toFixed(1)}s</div>
                </div>

                {/* Tabs without extra useState (radio) */}
                <div className="border-b border-zinc-200 mb-4 flex gap-4 text-sm">
                  <label className="py-2 cursor-pointer">
                    <input type="radio" name="tab" defaultChecked className="peer sr-only" />
                    <span className="inline-flex items-center gap-2 text-zinc-600 peer-checked:text-zinc-900 peer-checked:font-semibold">
                      LinkedIn
                      <span className={["text-[11px] px-2 py-0.5 rounded-full", scorePill(linkedinScore)].join(" ")}>{linkedinScore}</span>
                    </span>
                  </label>
                  <label className="py-2 cursor-pointer">
                    <input type="radio" name="tab" className="peer sr-only" />
                    <span className="inline-flex items-center gap-2 text-zinc-600 peer-checked:text-zinc-900 peer-checked:font-semibold">
                      X
                      <span className={["text-[11px] px-2 py-0.5 rounded-full", scorePill(twitterScore)].join(" ")}>{twitterScore}</span>
                    </span>
                  </label>
                  <label className="py-2 cursor-pointer">
                    <input type="radio" name="tab" className="peer sr-only" />
                    <span className="inline-flex items-center gap-2 text-zinc-600 peer-checked:text-zinc-900 peer-checked:font-semibold">
                      Instagram
                      <span className={["text-[11px] px-2 py-0.5 rounded-full", scorePill(instagramScore)].join(" ")}>{instagramScore}</span>
                    </span>
                  </label>
                </div>

                {/* Panels (simple vertical stack; show all with headings to avoid extra state) */}
                <div className="grid gap-4">
                  <PlatformCard
                    platform="linkedin"
                    title="LinkedIn 포스트"
                    reach={results.platform_posts.linkedin.estimated_reach}
                    viralScore={results.platform_posts.linkedin.viral_score}
                    keywords={results.platform_posts.linkedin.keywords}
                    analysis={results.platform_posts.linkedin.analysis}
                    bodyText={results.platform_posts.linkedin.post}
                  />

                  <PlatformCard
                    platform="twitter"
                    title="X 스레드"
                    reach={results.platform_posts.twitter.estimated_reach}
                    viralScore={results.platform_posts.twitter.viral_score}
                    keywords={results.platform_posts.twitter.keywords}
                    analysis={results.platform_posts.twitter.analysis}
                    bodyText={results.platform_posts.twitter.thread.join("\n\n")}
                  />

                  <PlatformCard
                    platform="instagram"
                    title="Instagram 캡션"
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
                        <div className="text-xs font-semibold text-zinc-500 mb-2">캐러셀 슬라이드 (5장)</div>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                          {(results.platform_posts.instagram.carousel_slides || []).slice(0, 5).map((t, idx) => (
                            <div key={idx} className="rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                              <div className="text-[10px] font-semibold text-zinc-500">슬라이드 {idx + 1}</div>
                              <div className="mt-1 text-xs text-zinc-900 leading-5 break-words">{t}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    }
                  />
                </div>
              </>
            ) : null}
          </div>
        </div>

        <p className="mt-4 text-xs text-zinc-400">
          API: <span className="font-mono">{apiBase}</span>
        </p>
      </div>
    </div>
  );
}
