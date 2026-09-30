import type { Metadata } from "next";
import Header from "@/components/ui/Header";
import Footer from "@/components/ui/Footer";
import ScamAlert from "@/components/sections/ScamAlert";

export const metadata: Metadata = {
  title: "공지사항 | DAILY F&I",
  description:
    "(주)데일리에프앤아이대부 공지사항. 당사는 대출 권유·광고 목적의 전화와 문자메시지를 발송하지 않습니다. 당사 사칭 보이스피싱에 주의하시기 바랍니다.",
};

export default function NoticePage() {
  return (
    <>
      <Header />
      <main className="flex-1 bg-white">
        <div className="bg-gray-50 border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">공지사항</h1>
            <p className="mt-3 text-sm sm:text-base text-gray-600">
              고객님께 안내드리는 공식 공지입니다.
            </p>
          </div>
        </div>

        <ScamAlert />
      </main>
      <Footer />
    </>
  );
}
