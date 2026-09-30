"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE } from "@/lib/constants";

const HIDE_UNTIL_KEY = "dfni_scam_popup_hide_until";   // localStorage: 오늘 하루 열지 않기
const CLOSED_KEY = "dfni_scam_popup_closed";           // sessionStorage: 이번 방문에서 닫음

function suppressed(): boolean {
  try {
    const until = window.localStorage.getItem(HIDE_UNTIL_KEY);
    if (until && Date.now() < Number(until)) return true;
  } catch {
    /* private mode 등 — 무시하고 노출 */
  }
  try {
    if (window.sessionStorage.getItem(CLOSED_KEY) === "1") return true;
  } catch {
    /* 무시 */
  }
  return false;
}

/**
 * 사칭·보이스피싱 주의 팝업 (전 페이지, 1일 1회)
 * 공지 전문: /notice
 */
export default function ScamPopup() {
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  // 공지사항 페이지에는 전문이 이미 노출되므로 팝업 생략
  // 정적 export라 /notice, /notice/, /notice.html 세 형태로 접근될 수 있다
  const onNoticePage = (pathname || "")
    .replace(/\.html$/, "")
    .replace(/\/$/, "") === "/notice";

  useEffect(() => {
    if (onNoticePage || suppressed()) return;
    const timer = window.setTimeout(() => setOpen(true), 500);
    return () => window.clearTimeout(timer);
  }, [onNoticePage]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, today]);

  function close() {
    if (today) {
      const next = new Date();
      next.setHours(24, 0, 0, 0); // 다음 자정까지 숨김
      try {
        window.localStorage.setItem(HIDE_UNTIL_KEY, String(next.getTime()));
      } catch {
        /* 무시 */
      }
    } else {
      try {
        window.sessionStorage.setItem(CLOSED_KEY, "1");
      } catch {
        /* 무시 */
      }
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scamPopupTitle"
    >
      <button
        type="button"
        aria-label="공지 닫기"
        onClick={close}
        className="absolute inset-0 w-full h-full bg-gray-900/70 backdrop-blur-sm cursor-default"
      />

      <div className="relative w-full max-w-lg max-h-[88vh] flex flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-error/20">
        <button
          type="button"
          onClick={close}
          aria-label="공지 닫기"
          className="absolute top-3 right-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex-1 overflow-y-auto px-6 pt-7 pb-6 sm:px-8">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-error/10 text-error">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </span>
            <span className="inline-flex items-center rounded-full bg-error px-2.5 py-0.5 text-xs font-bold text-white">중요 공지</span>
            <span className="text-sm text-gray-500 tabular-nums">2026.09.30</span>
          </div>

          <h2 id="scamPopupTitle" className="mt-4 text-xl sm:text-2xl font-bold text-gray-900 leading-snug">
            당사 사칭 대출 문자 · 전화는 보이스피싱입니다
          </h2>
          <p className="mt-3 text-sm sm:text-base text-gray-600 leading-relaxed">
            {SITE.companyName} 및 임직원을 사칭하여 대출을 권유하거나 금전을 요구하는 사례가 확인되고 있습니다.
          </p>

          <ul className="mt-5 space-y-2.5">
            {[
              {
                title: "대출 권유·광고 문자와 전화를 발송하지 않습니다",
                body: "당사가 연락드리는 경우는 고객님이 직접 상담을 신청하신 건에 대한 회신에 한합니다.",
              },
              {
                title: "‘서○○ 팀장’은 당사 임직원이 아닙니다",
                body: "재직 사실이 없으며, 당사와 어떠한 위임·대리 관계도 없습니다.",
              },
              {
                title: "신청하지 않은 대출 연락은 100% 사칭입니다",
                body: "수수료·보증금 명목의 선입금, 개인 계좌 송금, 앱 설치 요구는 모두 불법입니다.",
              },
            ].map((item) => (
              <li key={item.title} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-[15px] font-bold text-gray-900 leading-snug">{item.title}</p>
                <p className="mt-1 text-sm text-gray-600 leading-relaxed">{item.body}</p>
              </li>
            ))}
          </ul>

          <div className="mt-5 rounded-xl border border-accent/25 bg-accent/5 p-4">
            <p className="text-sm text-gray-700 leading-relaxed">
              의심되는 연락을 받으셨다면 응답하지 마시고 대표전화{" "}
              <a href={`tel:${SITE.phone}`} className="font-bold text-accent tabular-nums underline underline-offset-2">
                {SITE.phone}
              </a>{" "}
              또는 금융감독원{" "}
              <a href="tel:1332" className="font-bold text-accent tabular-nums underline underline-offset-2">
                1332
              </a>
              로 신고해 주십시오.
            </p>
          </div>

          <Link
            href="/notice"
            onClick={() => {
              try {
                window.sessionStorage.setItem(CLOSED_KEY, "1");
              } catch {
                /* 무시 */
              }
              setOpen(false);
            }}
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent hover:bg-accent-hover px-5 py-2.5 text-[15px] font-semibold text-white transition-colors"
          >
            공지 전문 보기
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-gray-200 bg-gray-50 px-5 py-3">
          <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={today}
              onChange={(e) => setToday(e.target.checked)}
              className="h-4 w-4 accent-accent cursor-pointer"
            />
            오늘 하루 열지 않기
          </label>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            className="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
