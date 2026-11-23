"use client";

import FooterSection from "@/components/Footer";
import Navbar from "@/components/Navbar";
import SpeakButton from "@/components/speak";
import { useEffect, useState } from "react";
import { PreambleVerbatim } from "./PreambleVerbatim";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Keyword {
  word: string;
  meaning: string;
  icon: string;
}
interface Timeline {
  year: string;
  event: string;
}
interface QuickFact {
  label: string;
  value: string;
}
interface LandmarkCase {
  year: string;
  name: string;
  description: string;
}
interface Note {
  type: "amendment" | "did-you-know";
  text: string;
}

interface PreambleData {
  officialText: string;
  simpleExplanation: string;
  whyItMatters: string;
  keywords: Keyword[];
  timeline: Timeline[];
  quickFacts: QuickFact[];
  landmarkCases: LandmarkCase[];
  notes: Note[];
  source?: { attribution?: string; document?: string; title?: string };
  officialTextIsVerified?: boolean;
  plainMeaning?: string;
  plainContext?: string;
  concepts?: Record<ConceptKey, ConceptExplanation>;
}

type ConceptKey = "justice" | "liberty" | "equality" | "fraternity";

type ConceptExplanation = {
  meaning: string;
  significance: string;
  example: string;
  preambleWording: string;
};

const CONCEPTS: { key: ConceptKey; label: string }[] = [
  { key: "justice", label: "Justice" },
  { key: "liberty", label: "Liberty" },
  { key: "equality", label: "Equality" },
  { key: "fraternity", label: "Fraternity" },
];

// ─── Keyword Card ─────────────────────────────────────────────────────────────
function KeywordCard({ word, meaning, icon }: Keyword) {
  return (
    <div className="group relative bg-white border border-[#c9b99a] rounded-2xl p-5 sm:p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_24px_rgba(196,130,50,0.15)] hover:border-[#c48232] overflow-hidden">
      <span className="absolute top-3 right-4 text-5xl font-bold text-[#f5ede0] select-none pointer-events-none group-hover:text-[#fde8c4] transition-colors duration-300">
        {icon}
      </span>
      <p className="text-[10px] font-bold text-[#c48232] tracking-[2px] uppercase mb-2 relative z-10">
        Key Term
      </p>
      <p className="font-extrabold text-lg text-[#1a1208] font-serif mb-2 relative z-10">
        {word}
      </p>
      <p className="text-sm text-[#7a6a50] leading-relaxed relative z-10">
        {meaning}
      </p>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`animate-pulse bg-[#f0e8d8] rounded ${className}`}
    />
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PreamblePage() {
  const [data, setData] = useState<PreambleData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataRetryKey, setDataRetryKey] = useState(0);

  const [selectedConcept, setSelectedConcept] = useState<ConceptKey | null>(
    null,
  );

  const parse = <T,>(raw: unknown, fallback: T): T => {
    if (!raw) return fallback;
    if (typeof raw !== "string") return raw as T;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  };

  // Preamble-specific data only. Never fetches Article or other detail data.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setDataError(null);

    fetch("/api/preamble")
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Failed to load the Preamble (${response.status})`);
        return response.json();
      })
      .then((d) => {
        if (cancelled) return;
        setData({
          officialText: d.officialText ?? "",
          simpleExplanation: d.simpleExplanation ?? "",
          whyItMatters: d.whyItMatters ?? "",
          keywords: parse(d.keywords, []),
          timeline: parse(d.timeline, []),
          quickFacts: parse(d.quickFacts, []),
          landmarkCases: parse(d.landmarkCases, []),
          notes: parse(d.notes, []),
          source: d.source,
          officialTextIsVerified: d.officialTextIsVerified,
          plainMeaning: d.plainMeaning,
          plainContext: d.plainContext,
          concepts: d.concepts,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setDataError(
          error instanceof Error
            ? error.message
            : "Failed to load the Preamble.",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dataRetryKey]);

  const amendmentNotes =
    data?.notes.filter((n) => n.type === "amendment") ?? [];
  const didYouKnowNotes =
    data?.notes.filter((n) => n.type === "did-you-know") ?? [];
  const selectedConceptData = selectedConcept
    ? data?.concepts?.[selectedConcept]
    : null;

  return (
    <>
      <Navbar />

      <div className="font-sans bg-[#faf7f2] min-h-screen text-[#1a1208] pt-16">
        {/* ── Hero ── */}
        <section className="relative bg-gradient-to-br from-[#fdf6ec] via-[#f5ede0] to-[#ede8df] border-b border-[#d6c7a8] overflow-hidden">
          <span className="absolute -right-8 top-0 text-[180px] sm:text-[260px] font-extrabold font-serif text-[#e8d8c0]/40 select-none pointer-events-none leading-none">
            We
          </span>
          <div className="relative max-w-368 mx-auto px-4 sm:px-8 md:px-12 lg:px-16 pt-12 sm:pt-16 md:pt-20 pb-10 sm:pb-14">
            <div className="flex items-center gap-3 mb-6">
              <span className="inline-flex items-center gap-1.5 bg-[#fdf3e3] border border-[#e0c99a] rounded-full px-3 py-1 text-[11px] font-bold text-[#c48232] tracking-wide">
                Foundational Document
              </span>
              <span className="text-[#c9b99a] text-xs">·</span>
              <span className="text-[11px] text-[#9e8c73] font-medium">
                Adopted 26 November 1949
              </span>
            </div>
            <h1 className="font-extrabold text-[#1a1208] font-serif leading-none mb-4 text-5xl sm:text-6xl md:text-7xl lg:text-8xl">
              The
              <br />
              Preamble
            </h1>
            <p className="text-sm sm:text-base md:text-lg text-[#7a6a50] leading-relaxed max-w-xl mb-8">
              The soul of the Constitution — a single paragraph that declares
              who we are, what we believe, and what we promise each other as a
              nation.
            </p>
          </div>
        </section>

        {/* ── Main Body ── */}
        <div className="max-w-full mx-auto px-4 sm:px-8 md:px-12 lg:px-16 py-10 sm:py-14">
          <div className="flex flex-col lg:flex-row gap-10 xl:gap-14">
            {/* ── Left Column ── */}
            <div className="flex-1 min-w-0 space-y-10">
              
              {/* Official Text — Classic Verbatim View */}
              <section aria-labelledby="official-text-heading">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div className="flex flex-1 items-center gap-2">
                    <span
                      id="official-text-heading"
                      className="text-[10px] font-bold uppercase tracking-[2px] text-[#c48232]"
                    >
                      Official Text · Verbatim
                    </span>
                    <div className="h-px flex-1 bg-[#e8d4a0]" />
                  </div>
                  {!isLoading && data?.officialText && (
                    <span className="text-[10.5px] font-medium text-[#8c785c]">42nd Amendment (1976)</span>
                  )}
                </div>

                <div className="overflow-hidden rounded-3xl border border-[#d9c9a9] bg-white shadow-[0_6px_24px_-12px_rgba(74,60,40,0.14)]">
                  <div className="h-1 w-full bg-gradient-to-r from-[#d9c9a9]/40 via-[#c48232]/70 to-[#d9c9a9]/40" />

                  <div className="px-6 py-7 sm:px-9 sm:py-8">
                    {dataError && (
                      <div
                        role="alert"
                        className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
                      >
                        <span>{dataError}</span>
                        <button
                          type="button"
                          onClick={() => setDataRetryKey((key) => key + 1)}
                          className="rounded-lg border border-red-300 bg-white px-3 py-1 font-semibold text-red-700 transition hover:bg-red-100"
                        >
                          Retry
                        </button>
                      </div>
                    )}

                    {isLoading ? (
                      <div className="max-w-3xl space-y-3">
                        {[100, 88, 94, 76, 84, 70].map((w, i) => (
                          <Skeleton key={i} className="h-4" style={{ width: `${w}%` }} />
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-[#efe4cc] bg-[#fcf9f2]/75 px-5 py-8 sm:px-10 sm:py-10">
                        <PreambleVerbatim />
                      </div>
                    )}

                    <div className="mt-7 flex flex-col gap-4 border-t border-[#ecdfc4] pt-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#c48232]/70 bg-[#fcf9f2]">
                          <span className="text-[10px] font-bold tracking-tight text-[#c48232]">IN</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold leading-tight text-[#4a3c28]">Constitution of India</p>
                          <p className="mt-0.5 text-[10.5px] leading-snug text-[#9e8c73]">
                            Adopted 26 November 1949 · Commenced 26 January 1950
                          </p>
                          <p className="mt-0.5 text-[10px] leading-snug text-[#a9987d]">
                            {data?.source?.attribution || "Source: Preamble to the Constitution of India"}
                          </p>
                        </div>
                      </div>

                      {!isLoading && data?.officialText && (
                        <div className="shrink-0">
                          <SpeakButton text={data.officialText} audioSrc="/audio/preamble.wav" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Plain English */}
              <section>
                <div className="flex items-center gap-2 mb-5">
                  <span className="text-[10px] font-bold text-[#c48232] tracking-[2px] uppercase">
                    In Plain English
                  </span>
                  <div className="flex-1 h-px bg-[#e8d4a0]" />
                </div>
                <div className="bg-white border border-[#c9b99a] rounded-2xl p-6 sm:p-8">
                  {isLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-4/5" />
                    </div>
                  ) : dataError ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
                      <span>{dataError}</span>
                      <button
                        type="button"
                        onClick={() => setDataRetryKey((key) => key + 1)}
                        className="rounded-lg border border-red-300 bg-white px-3 py-1 font-semibold text-red-700 hover:bg-red-100"
                      >
                        Retry
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="font-serif text-[15px] leading-relaxed text-[#2c2216] sm:text-[16px]">
                        {data?.plainMeaning}
                      </p>
                      <p className="mt-3 font-serif text-[15px] leading-relaxed text-[#2c2216] sm:text-[16px]">
                        {data?.plainContext}
                      </p>

                      <div className="mt-5 pt-5 border-t border-[#f0ece4]">
                        <p className="mb-3 text-[10px] font-bold text-[#c48232] tracking-[2px] uppercase">
                          Explore the four ideals
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          {CONCEPTS.map(({ key, label }) => {
                            const active = selectedConcept === key;
                            return (
                              <button
                                key={key}
                                type="button"
                                aria-pressed={active}
                                onClick={() =>
                                  setSelectedConcept((current) =>
                                    current === key ? null : key,
                                  )
                                }
                                className={`text-center rounded-xl py-3 px-2 transition-all border ${
                                  active
                                    ? "bg-[#c48232] border-[#c48232] shadow-sm"
                                    : "bg-[#fdf3e3] border-[#e8d4a0] hover:border-[#c48232] hover:bg-[#fae9cd]"
                                }`}
                              >
                                <p
                                  className={`text-xs font-bold tracking-wide ${active ? "text-white" : "text-[#c48232]"}`}
                                >
                                  {label}
                                </p>
                              </button>
                            );
                          })}
                        </div>

                        {selectedConcept && (
                          <div className="mt-4 rounded-xl border border-[#c9b99a] bg-[#fffdf8] p-4 sm:p-5">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <h4 className="font-serif text-base font-extrabold text-[#1a1208]">
                                {
                                  CONCEPTS.find(
                                    (concept) =>
                                      concept.key === selectedConcept,
                                  )?.label
                                }
                              </h4>
                              <button
                                type="button"
                                onClick={() => setSelectedConcept(null)}
                                className="rounded-lg border border-[#e8d4a0] px-2 py-0.5 text-[10px] font-semibold text-[#9e8c73] hover:text-[#c48232]"
                              >
                                Close
                              </button>
                            </div>
                            {selectedConceptData ? (
                              <div className="space-y-3 text-sm leading-7 text-[#4a3c28]">
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#c48232]">
                                    Meaning
                                  </p>
                                  <p>{selectedConceptData.meaning}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#c48232]">
                                    Constitutional significance
                                  </p>
                                  <p>{selectedConceptData.significance}</p>
                                </div>
                                <blockquote className="rounded-lg border-l-4 border-[#c48232] bg-[#fdf3e3] px-3 py-2 font-serif text-[13px] italic text-[#4a3c28]">
                                  &ldquo;{selectedConceptData.preambleWording}
                                  &rdquo;
                                </blockquote>
                                <div>
                                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#c48232]">
                                    Practical example
                                  </p>
                                  <p>{selectedConceptData.example}</p>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </section>

              {/* Why It Matters */}
              {(isLoading || data?.whyItMatters) && (
                <section>
                  <div className="flex items-center gap-2 mb-5">
                    <span className="text-[10px] font-bold text-[#c48232] tracking-[2px] uppercase">
                      Why It Matters
                    </span>
                    <div className="flex-1 h-px bg-[#e8d4a0]" />
                  </div>
                  <div className="bg-white border border-[#c9b99a] rounded-2xl p-6 sm:p-8">
                    {isLoading ? (
                      <Skeleton className="h-16 w-full" />
                    ) : (
                      <p className="whitespace-pre-wrap font-serif text-[15px] leading-relaxed text-[#2c2216] sm:text-[16px]">
                        {data?.whyItMatters}
                      </p>
                    )}
                  </div>
                </section>
              )}

              {/* Keywords */}
              {(isLoading || (data?.keywords?.length ?? 0) > 0) && (
                <section>
                  <div className="flex items-center gap-2 mb-5">
                    <span className="text-[10px] font-bold text-[#c48232] tracking-[2px] uppercase">
                      Key Terms
                    </span>
                    <div className="flex-1 h-px bg-[#e8d4a0]" />
                  </div>
                  {isLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[1, 2, 3, 4].map((i) => (
                        <Skeleton key={i} className="h-28" />
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {data?.keywords.map((kw) => (
                        <KeywordCard key={kw.word} {...kw} />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* Timeline */}
              {(isLoading || (data?.timeline?.length ?? 0) > 0) && (
                <section>
                  <div className="flex items-center gap-2 mb-5">
                    <span className="text-[10px] font-bold text-[#c48232] tracking-[2px] uppercase">
                      Historical Timeline
                    </span>
                    <div className="flex-1 h-px bg-[#e8d4a0]" />
                  </div>
                  <div className="bg-white border border-[#c9b99a] rounded-2xl p-6 sm:p-8">
                    {isLoading ? (
                      <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                          <Skeleton key={i} className="h-12" />
                        ))}
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="absolute left-2.75 top-2 bottom-2 w-px bg-[#e8d4a0]" />
                        <div className="space-y-6">
                          {data?.timeline.map((item, i) => (
                            <div
                              key={i}
                              className="flex gap-5 items-start relative"
                            >
                              <div className="shrink-0 w-6 h-6 rounded-full bg-[#fdf3e3] border-2 border-[#c48232] flex items-center justify-center relative z-10">
                                <div className="w-2 h-2 rounded-full bg-[#c48232]" />
                              </div>
                              <div className="flex-1 pb-1">
                                <span className="text-[11px] font-bold text-[#c48232] tracking-widest">
                                  {item.year}
                                </span>
                                <p className="text-sm text-[#4a3c28] leading-relaxed mt-0.5">
                                  {item.event}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>

            {/* ── Right Sidebar ── */}
            <aside className="w-full lg:w-64 xl:w-72 shrink-0 space-y-5 lg:sticky lg:top-20 lg:self-start">
              {/* Quick Facts */}
              <div className="rounded-2xl border border-[#c9b99a] bg-white p-5">
                <p className="text-[10px] font-bold text-[#c48232] tracking-[2px] uppercase mb-4">
                  Quick Facts
                </p>
                {isLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-4" />
                    ))}
                  </div>
                ) : dataError ? (
                  <button
                    type="button"
                    onClick={() => setDataRetryKey((key) => key + 1)}
                    className="text-xs font-semibold text-[#c48232] underline underline-offset-2"
                  >
                    Retry loading facts
                  </button>
                ) : (
                  <div className="space-y-3">
                    {data?.quickFacts.map(({ label, value }, index) => (
                      <div
                        key={`${label}-${index}`}
                        className="border-b border-[#f0ece4] pb-2.5 last:border-0 last:pb-0"
                      >
                        {label && (
                          <p className="text-[10px] font-medium text-[#9e8c73]">
                            {label}
                          </p>
                        )}
                        <p className="text-[12.5px] font-bold leading-snug text-[#1a1208]">
                          {value}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Landmark Cases */}
              {(isLoading || (data?.landmarkCases?.length ?? 0) > 0) && (
                <div className="rounded-2xl border border-[#c9b99a] bg-white p-5">
                  <p className="text-[10px] font-bold text-[#c48232] tracking-[2px] uppercase mb-4">
                    Landmark Cases
                  </p>
                  {isLoading ? (
                    <Skeleton className="h-24" />
                  ) : (
                    <div className="space-y-3">
                      {data?.landmarkCases.map((lc, i) => (
                        <div
                          key={i}
                          className="bg-[#fdf3e3] border border-[#e8d4a0] rounded-xl p-4"
                        >
                          <p className="text-[10px] font-bold text-[#c48232] uppercase tracking-widest mb-1">
                            {lc.year}
                          </p>
                          <p className="font-bold text-sm text-[#1a1208] font-serif mb-2">
                            {lc.name}
                          </p>
                          <p className="text-xs text-[#7a6a50] leading-relaxed">
                            {lc.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Amendment Notes */}
              {(isLoading || amendmentNotes.length > 0) && (
                <div className="rounded-2xl border border-[#fde68a] bg-[#fffbeb] p-5">
                  <p className="text-[10px] font-bold text-amber-700 tracking-[2px] uppercase mb-3">
                    Amendment Notes
                  </p>
                  {isLoading ? (
                    <Skeleton className="h-12" />
                  ) : (
                    <div className="space-y-3">
                      {amendmentNotes.map((n, i) => (
                        <p
                          key={i}
                          className="text-sm text-[#7a5e00] leading-relaxed border-b border-amber-100 last:border-0 pb-3 last:pb-0"
                        >
                          {n.text}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Did You Know */}
              {(isLoading || didYouKnowNotes.length > 0) && (
                <div className="rounded-2xl border border-[#c9b99a] bg-white p-5">
                  <p className="text-[10px] font-bold text-[#c48232] tracking-[2px] uppercase mb-3">
                    Did You Know?
                  </p>
                  {isLoading ? (
                    <Skeleton className="h-16" />
                  ) : (
                    <div className="space-y-3">
                      {didYouKnowNotes.map((n, i) => (
                        <p
                          key={i}
                          className="text-sm text-[#4a3c28] leading-relaxed border-b border-[#f0ece4] last:border-0 pb-3 last:pb-0"
                        >
                          {n.text}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </aside>
          </div>
        </div>

        <FooterSection />
      </div>
    </>
  );
}
