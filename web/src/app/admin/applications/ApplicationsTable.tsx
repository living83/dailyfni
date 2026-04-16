"use client";

import { useState } from "react";
import { MemoPopup, useMemoPopup } from "@/components/ui/MemoPopup";

type Row = {
  id: string;
  name: string;
  phone: string;
  carrier: string;
  status: string;
  reviewer: string | null;
  reviewMemo: string | null;
  createdAt: string;
};

const maskPhone = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  if (d.length < 8) return phone;
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
};

const fmt = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

/**
 * 대출신청내역 테이블.
 *
 * 심사메모 열기 흐름:
 *   1) 행 더블클릭 → useMemoPopup.open() 호출
 *   2) window.open 으로 /admin/applications/{id}/memo 를 별도 창에 띄움
 *   3) 브라우저가 팝업을 차단하면 동일 URL 대신 선로딩된 데이터로 모달 표시
 *      (모달은 네트워크 없이 즉시 열리도록, fallbackContent 로 요약본을 내려준다.)
 */
export default function ApplicationsTable({ rows }: { rows: Row[] }) {
  const { state, open, close } = useMemoPopup();
  const [lastOpened, setLastOpened] = useState<string | null>(null);

  const handleOpen = (row: Row) => {
    setLastOpened(row.id);
    open({
      url: `/admin/applications/${row.id}/memo`,
      windowName: `memo_${row.id}`,
      title: `심사메모 · ${row.name}`,
      width: 760,
      height: 680,
      // 팝업 차단 시 모달 fallback 으로 보여줄 요약 내용.
      // (정식 보기는 같은 URL 을 새 창에서 보여주므로, 모달은 차단 대응용 요약이다.)
      fallbackContent: (
        <div className="space-y-4">
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            브라우저가 팝업을 차단해 모달로 표시합니다. 별도 창으로 보려면{" "}
            <a
              href={`/admin/applications/${row.id}/memo`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              이 링크
            </a>
            를 이용하세요.
          </div>
          <dl className="grid grid-cols-[80px_1fr] gap-y-1.5">
            <dt className="text-gray-500">이름</dt>
            <dd>{row.name}</dd>
            <dt className="text-gray-500">연락처</dt>
            <dd className="font-mono">{maskPhone(row.phone)}</dd>
            <dt className="text-gray-500">통신사</dt>
            <dd>{row.carrier}</dd>
            <dt className="text-gray-500">상태</dt>
            <dd>{row.status}</dd>
            <dt className="text-gray-500">접수일</dt>
            <dd>{fmt(row.createdAt)}</dd>
          </dl>
          <div>
            <div className="text-xs font-semibold text-gray-700 mb-1">심사메모</div>
            <div className="p-3 bg-gray-50 border border-gray-200 rounded whitespace-pre-wrap min-h-[80px]">
              {row.reviewMemo?.trim() ? row.reviewMemo : (
                <span className="text-gray-400">등록된 심사메모가 없습니다.</span>
              )}
            </div>
            {row.reviewer && (
              <p className="text-xs text-gray-500 mt-1.5">심사자: {row.reviewer}</p>
            )}
          </div>
        </div>
      ),
    });
  };

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left font-medium">접수일</th>
              <th className="px-3 py-2 text-left font-medium">이름</th>
              <th className="px-3 py-2 text-left font-medium">연락처</th>
              <th className="px-3 py-2 text-left font-medium">통신사</th>
              <th className="px-3 py-2 text-left font-medium">상태</th>
              <th className="px-3 py-2 text-left font-medium">심사자</th>
              <th className="px-3 py-2 text-left font-medium">심사메모</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                  접수 내역이 없습니다.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const highlighted = lastOpened === row.id;
              return (
                <tr
                  key={row.id}
                  onDoubleClick={() => handleOpen(row)}
                  title="더블클릭하여 심사메모 열기"
                  className={`border-t border-gray-100 cursor-pointer select-none hover:bg-accent/5 ${
                    highlighted ? "bg-accent/10" : ""
                  }`}
                >
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{fmt(row.createdAt)}</td>
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2 font-mono text-gray-700">{maskPhone(row.phone)}</td>
                  <td className="px-3 py-2">{row.carrier}</td>
                  <td className="px-3 py-2">
                    <span className="inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs">
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{row.reviewer ?? "-"}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-xs truncate">
                    {row.reviewMemo ?? <span className="text-gray-300">-</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <MemoPopup state={state} onClose={close} />
    </>
  );
}
