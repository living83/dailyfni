import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import MemoView from "./MemoView";

/**
 * 심사메모 독립 페이지.
 * 팝업 창(window.open 대상)과 모달 fallback 에서 동일하게 쓰기 위해
 * 실제 콘텐츠는 <MemoView /> 로 분리해 재사용한다.
 */
export default async function MemoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const application = await prisma.application.findUnique({
    where: { id },
    include: {
      submissions: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!application) notFound();

  return (
    <div className="min-h-screen bg-white text-gray-900 p-5">
      <MemoView application={application} />
    </div>
  );
}
