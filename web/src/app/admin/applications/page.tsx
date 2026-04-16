import { prisma } from "@/lib/db";
import ApplicationsTable from "./ApplicationsTable";

/**
 * 관리자: 대출신청내역.
 * 각 행을 더블클릭하면 심사메모가 별도 창(팝업)으로 뜨고,
 * 팝업이 차단된 환경에서는 동일 내용이 모달로 표시된다.
 * (론앤마스터 admin/agent/statuswin.asp 와 같은 동작)
 */
export default async function ApplicationsPage() {
  const applications = await prisma.application.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      phone: true,
      carrier: true,
      status: true,
      reviewer: true,
      reviewMemo: true,
      createdAt: true,
    },
  });

  // Date 를 직렬화 가능한 문자열로 변환해 클라이언트 컴포넌트에 전달
  const rows = applications.map((a) => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-5 py-3">
        <h1 className="text-lg font-bold text-gray-900">대출신청내역</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          심사메모를 확인하려면 해당 행을 더블클릭하세요.
        </p>
      </header>
      <main className="p-5">
        <ApplicationsTable rows={rows} />
      </main>
    </div>
  );
}
