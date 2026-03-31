import Header from "@/components/ui/Header";
import Footer from "@/components/ui/Footer";
import { SITE } from "@/lib/constants";

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="flex-1 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8">이용약관</h1>

          <div className="prose prose-sm prose-gray max-w-none space-y-6 text-sm text-gray-700 leading-relaxed">
            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-2">제1조 (목적)</h2>
              <p>이 약관은 {SITE.companyName}(이하 &quot;회사&quot;)가 운영하는 웹사이트에서 제공하는 대부중개 서비스의 이용 조건 및 절차에 관한 사항을 규정함을 목적으로 합니다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-2">제2조 (정의)</h2>
              <p>① &quot;서비스&quot;란 회사가 웹사이트를 통해 제공하는 대출 중개 상담 및 정보 제공 서비스를 말합니다.</p>
              <p>② &quot;이용자&quot;란 이 약관에 따라 회사가 제공하는 서비스를 이용하는 자를 말합니다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-2">제3조 (약관의 게시 및 변경)</h2>
              <p>① 회사는 이 약관의 내용을 이용자가 알 수 있도록 웹사이트에 게시합니다.</p>
              <p>② 회사는 관련 법령을 위배하지 않는 범위에서 이 약관을 변경할 수 있으며, 변경 시 적용일자 7일 전부터 공지합니다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-2">제4조 (서비스의 내용)</h2>
              <p>회사는 다음의 서비스를 제공합니다:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>대출 상품 정보 제공 및 비교</li>
                <li>대출 상담 신청 접수</li>
                <li>금융사 연결 및 중개</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-2">제5조 (이용자의 의무)</h2>
              <p>이용자는 서비스 이용 시 정확한 정보를 제공해야 하며, 허위 정보 제공으로 인한 불이익은 이용자 본인에게 있습니다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-2">제6조 (면책)</h2>
              <p>① 회사는 대출 심사 결과에 대해 보증하지 않으며, 최종 대출 승인은 금융사의 판단에 따릅니다.</p>
              <p>② 회사는 천재지변, 시스템 장애 등 불가항력으로 인한 서비스 중단에 대해 책임을 지지 않습니다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-2">부칙</h2>
              <p>이 약관은 2026년 3월 31일부터 시행합니다.</p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
