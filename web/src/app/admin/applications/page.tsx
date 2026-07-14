import { prisma } from "@/lib/db";
import ApplicationsTable from "./ApplicationsTable";

/**
 * 관리자: 대출신청내역.
 * 행을 더블클릭하면 심사메모 전체 내용이 모달로 표시된다.
 * (외부 팝업/크롤링 없이 우리 전산에 등재된 데이터만 사용)
 */
export default async function ApplicationsPage() {
  const applications = await prisma.application.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      submissions: { orderBy: { createdAt: "asc" } },
    },
  });

  // Date 를 직렬화 가능한 문자열로 변환해 클라이언트 컴포넌트에 전달
  const rows = applications.map((a) => ({
    id: a.id,
    name: a.name,
    phone: a.phone,
    carrier: a.carrier,
    isEmployee: a.isEmployee,
    has4Insurance: a.has4Insurance,
    status: a.status,
    reviewer: a.reviewer,
    reviewMemo: a.reviewMemo,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    submissions: a.submissions.map((s) => ({
      id: s.id,
      transmissionType: s.transmissionType,
      status: s.status,
      failReason: s.failReason,
      retryCount: s.retryCount,
      createdAt: s.createdAt.toISOString(),
    })),
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
