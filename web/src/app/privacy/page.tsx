import Header from "@/components/ui/Header";
import Footer from "@/components/ui/Footer";
import { SITE } from "@/lib/constants";

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="flex-1 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8">개인정보처리방침</h1>

          <div className="prose prose-sm prose-gray max-w-none space-y-6 text-sm text-gray-700 leading-relaxed">
            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-2">1. 개인정보의 수집 및 이용 목적</h2>
              <p>{SITE.companyName}(이하 &quot;회사&quot;)는 다음의 목적을 위하여 개인정보를 처리합니다:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>대출 상담 신청 접수 및 처리</li>
                <li>고객 문의 응대</li>
                <li>서비스 제공 및 개선</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-2">2. 수집하는 개인정보 항목</h2>
              <p>회사는 서비스 제공을 위해 다음 정보를 수집합니다:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>필수: 이름, 통신사, 전화번호</li>
                <li>선택: 직업 유형, 4대 보험 가입 여부</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-2">3. 개인정보의 보유 및 이용 기간</h2>
              <p>수집된 개인정보는 수집 목적 달성 후 지체 없이 파기합니다. 단, 관련 법령에 의해 보관이 필요한 경우 해당 기간 동안 보관합니다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-2">4. 개인정보의 제3자 제공</h2>
              <p>회사는 이용자의 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 다만, 대출 중개 서비스 제공을 위해 고객이 동의한 경우 협력 금융사에 정보를 전달할 수 있습니다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-2">5. 개인정보의 파기</h2>
              <p>개인정보 보유 기간이 경과하거나 처리 목적이 달성된 경우, 지체 없이 해당 개인정보를 복구·재생할 수 없도록 파기합니다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-2">6. 이용자의 권리</h2>
              <p>이용자는 언제든지 자신의 개인정보에 대해 열람, 정정, 삭제, 처리정지를 요청할 수 있습니다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-2">7. 개인정보 보호책임자</h2>
              <ul className="space-y-1">
                <li>성명: {SITE.ceoName}</li>
                <li>연락처: {SITE.phone}</li>
                <li>이메일: {SITE.email}</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-2">8. 시행일</h2>
              <p>이 개인정보처리방침은 2026년 3월 31일부터 시행합니다.</p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
