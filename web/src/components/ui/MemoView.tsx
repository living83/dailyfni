type SubmissionLite = {
  id: string;
  transmissionType: string;
  status: string;
  failReason: string | null;
  retryCount: number;
  createdAt: string; // ISO
};

export type MemoApplication = {
  id: string;
  name: string;
  carrier: string;
  phone: string;
  isEmployee: string | null;
  has4Insurance: string | null;
  status: string;
  reviewer: string | null;
  reviewMemo: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  submissions: SubmissionLite[];
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

const maskPhone = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  if (d.length < 8) return phone;
  return `${d.slice(0, 3)}-****-${d.slice(-4)}`;
};

/**
 * 심사메모 본문. 모달 내부에서 렌더된다.
 * 전산에 이미 전체 내용이 등재돼 있으므로 외부 팝업 없이 우리 DB 데이터로만 구성.
 */
export default function MemoView({ application }: { application: MemoApplication }) {
  return (
    <div className="text-sm">
      <section className="mb-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">신청 정보</h3>
        <dl className="grid grid-cols-[90px_1fr] gap-y-1.5 gap-x-3">
          <dt className="text-gray-500">이름</dt>
          <dd>{application.name}</dd>
          <dt className="text-gray-500">연락처</dt>
          <dd className="font-mono">{maskPhone(application.phone)}</dd>
          <dt className="text-gray-500">통신사</dt>
          <dd>{application.carrier}</dd>
          <dt className="text-gray-500">직업</dt>
          <dd>{application.isEmployee ?? "-"}</dd>
          <dt className="text-gray-500">4대보험</dt>
          <dd>{application.has4Insurance ?? "-"}</dd>
          <dt className="text-gray-500">상태</dt>
          <dd>
            <span className="inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-700 text-xs">
              {application.status}
            </span>
          </dd>
          <dt className="text-gray-500">접수일</dt>
          <dd>{fmt(application.createdAt)}</dd>
          <dt className="text-gray-500">최종수정</dt>
          <dd>{fmt(application.updatedAt)}</dd>
        </dl>
      </section>

      <section className="mb-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">심사메모</h3>
        <div className="p-3 bg-gray-50 border border-gray-200 rounded whitespace-pre-wrap min-h-[100px]">
          {application.reviewMemo?.trim() ? application.reviewMemo : (
            <span className="text-gray-400">등록된 심사메모가 없습니다.</span>
          )}
        </div>
        {application.reviewer && (
          <p className="text-xs text-gray-500 mt-1.5">심사자: {application.reviewer}</p>
        )}
      </section>

      {application.submissions.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">전송 이력</h3>
          <table className="w-full border border-gray-200 text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium text-gray-600">일시</th>
                <th className="px-2 py-1.5 text-left font-medium text-gray-600">구분</th>
                <th className="px-2 py-1.5 text-left font-medium text-gray-600">상태</th>
                <th className="px-2 py-1.5 text-left font-medium text-gray-600">재시도</th>
                <th className="px-2 py-1.5 text-left font-medium text-gray-600">실패사유</th>
              </tr>
            </thead>
            <tbody>
              {application.submissions.map((s) => (
                <tr key={s.id} className="border-t border-gray-200">
                  <td className="px-2 py-1.5">{fmt(s.createdAt)}</td>
                  <td className="px-2 py-1.5">{s.transmissionType}</td>
                  <td className="px-2 py-1.5">{s.status}</td>
                  <td className="px-2 py-1.5">{s.retryCount}</td>
                  <td className="px-2 py-1.5 text-gray-600">{s.failReason ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
