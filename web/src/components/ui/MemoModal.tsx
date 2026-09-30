"use client";

import { useEffect, useRef } from "react";

/**
 * 심사메모 모달.
 * 전산에 이미 전체 내용이 등재돼 있으므로 외부 팝업(window.open) 없이
 * 항상 전체 화면 모달로 심사메모 전체 내용을 보여준다.
 */
export default function MemoModal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  // ESC 로 닫기 + 배경 스크롤 잠금 + 초기 포커스
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="memo-modal-title"
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
          <h2 id="memo-modal-title" className="text-base font-semibold text-gray-900">
            {title ?? "심사메모"}
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
        <div className="p-5 overflow-y-auto">{children}</div>
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
