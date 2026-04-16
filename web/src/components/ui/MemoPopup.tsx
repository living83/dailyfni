"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type OpenOptions = {
  /** 팝업 창으로 띄울 URL (별도 창 페이지). */
  url: string;
  /** 팝업이 차단되거나 열 수 없을 때 모달로 보여줄 내용. */
  fallbackContent: React.ReactNode;
  /** 모달/팝업 타이틀. */
  title?: string;
  /** 팝업 창 이름. 같은 idx를 재사용하면 기존 창이 앞으로 나옴. */
  windowName?: string;
  /** 팝업 창 크기. */
  width?: number;
  height?: number;
};

type ControllerState = OpenOptions & { mode: "popup" | "modal" };

/**
 * 론앤마스터 statuswin.asp 과 동일한 UX:
 *  1) window.open 으로 별도 창을 먼저 시도
 *  2) 브라우저가 팝업을 차단하면 전체 화면 모달로 폴백
 *
 * 사용 예시는 MemoPopup 하단의 useMemoPopup 훅 참조.
 */
export function MemoPopup({
  state,
  onClose,
}: {
  state: ControllerState | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // ESC 로 모달 닫기
  useEffect(() => {
    if (!state || state.mode !== "modal") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state, onClose]);

  // 모달 열렸을 때 포커스 이동 + 배경 스크롤 잠금
  useEffect(() => {
    if (!state || state.mode !== "modal") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [state]);

  if (!state || state.mode !== "modal") return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="memo-popup-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col focus:outline-none"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 id="memo-popup-title" className="text-base font-semibold text-gray-900">
            {state.title ?? "심사메모"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-gray-400 hover:text-gray-700 p-1 -m-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 overflow-y-auto text-sm text-gray-800">
          {state.fallbackContent}
        </div>
        <div className="px-5 py-3 border-t border-gray-200 text-right">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-md text-gray-700"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * 팝업 우선, 차단 시 모달 폴백 컨트롤러.
 *
 * 반환되는 open() 을 onDoubleClick 등에서 호출하면
 *  - 팝업이 열리면 true 를 돌려주고 모달은 뜨지 않는다.
 *  - 팝업이 막히면 내부 state 를 세팅해 <MemoPopup /> 가 모달로 렌더된다.
 */
export function useMemoPopup() {
  const [state, setState] = useState<ControllerState | null>(null);

  const open = useCallback((opts: OpenOptions) => {
    const features = [
      `width=${opts.width ?? 720}`,
      `height=${opts.height ?? 640}`,
      "resizable=yes",
      "scrollbars=yes",
      "status=no",
      "toolbar=no",
      "menubar=no",
      "location=no",
    ].join(",");

    let popup: Window | null = null;
    try {
      popup = window.open(opts.url, opts.windowName ?? "memoPopup", features);
    } catch {
      popup = null;
    }

    // 팝업 차단 감지: null 이거나 closed 이면 모달 폴백
    const blocked = !popup || popup.closed || typeof popup.focus !== "function";
    if (blocked) {
      setState({ ...opts, mode: "modal" });
      return false;
    }
    popup!.focus();
    return true;
  }, []);

  const close = useCallback(() => setState(null), []);

  return { state, open, close };
}
