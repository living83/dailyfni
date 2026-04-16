"use client";

import { useState } from "react";
import MemoModal from "@/components/ui/MemoModal";
import MemoView, { type MemoApplication } from "@/components/ui/MemoView";

const maskPhone = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  if (d.length < 8) return phone;
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/**
 * 대출신청내역 테이블.
 * 행 더블클릭 → 심사메모 모달 오픈.
 */
export default function ApplicationsTable({ rows }: { rows: MemoApplication[] }) {
  const [selected, setSelected] = useState<MemoApplication | null>(null);

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
            {rows.map((row) => (
              <tr
                key={row.id}
                onDoubleClick={() => setSelected(row)}
                title="더블클릭하여 심사메모 열기"
                className={`border-t border-gray-100 cursor-pointer select-none hover:bg-accent/5 ${
                  selected?.id === row.id ? "bg-accent/10" : ""
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
            ))}
          </tbody>
        </table>
      </div>

      <MemoModal
        open={selected !== null}
        title={selected ? `심사메모 · ${selected.name}` : "심사메모"}
        onClose={() => setSelected(null)}
      >
        {selected && <MemoView application={selected} />}
      </MemoModal>
    </>
  );
}
