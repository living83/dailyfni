import Header from "@/components/ui/Header";
import Footer from "@/components/ui/Footer";

export default function SmsTermsPage() {
  return (
    <>
      <Header />
      <main className="flex-1 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8">SMS서비스 및 메일링서비스약관</h1>

          <div className="space-y-8 text-sm text-gray-700 leading-relaxed">
            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제1조 (목적)</h2>
              <p>이 약관은 데일리에프앤아이대부(이하 &quot;회사&quot;)가 고객에게 제공하는 SMS(단문메시지서비스) 및 메일링서비스(이하 &quot;서비스&quot;)의 이용조건 및 절차에 관한 사항을 규정함을 목적으로 합니다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제2조 (서비스 내용 및 이용)</h2>
              <p className="mb-2">회사는 고객에게 다음 각 호의 서비스를 제공합니다.</p>

              <p className="mb-1"><strong>가. SMS/메일링 발송 범위</strong></p>
              <p className="mb-3">대출 상담 결과 안내, 상환 일정 안내, 상품 정보 제공, 기타 금융거래 관련 안내 등을 SMS 또는 이메일을 통해 발송합니다.</p>

              <p className="mb-1"><strong>나. 연락처 변경 통지의무</strong></p>
              <p className="mb-3">고객은 휴대전화번호, 이메일 주소 등 연락처가 변경된 경우 지체 없이 회사에 통지하여야 합니다. 고객이 통지를 게을리하여 발생하는 불이익에 대하여 회사는 책임을 지지 않습니다.</p>

              <p className="mb-1"><strong>다. 정보 유출 방지</strong></p>
              <p className="mb-3">회사는 서비스 제공 과정에서 취득한 고객의 개인정보가 유출되지 않도록 기술적·관리적 보호조치를 취합니다.</p>

              <p className="mb-1"><strong>라. 광고정보 수신 동의</strong></p>
              <p>광고성 정보의 전송은 고객의 사전 수신 동의를 받은 경우에 한하여 발송하며, 고객은 언제든지 수신 동의를 철회할 수 있습니다. 수신 거부 시 광고성 정보의 발송은 즉시 중단됩니다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제3조 (약관의 효력 및 변경)</h2>
              <p>본 약관은 서비스를 이용하고자 하는 모든 고객에게 적용되며, 회사의 웹사이트에 게시함으로써 효력이 발생합니다. 회사는 관련 법령을 위배하지 않는 범위에서 본 약관을 변경할 수 있으며, 변경 시 적용일자 7일 전부터 웹사이트를 통해 공지합니다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제4조 (개인정보 보유기간)</h2>
              <p className="mb-2">회사는 서비스 제공을 위해 수집한 개인정보를 다음과 같이 보유합니다.</p>
              <p className="mb-1"><strong>가.</strong> 금융거래 해지 후: 5년간 보유</p>
              <p><strong>나.</strong> 금융거래 거절 후: 3년간 보유</p>
              <p className="mt-2">보유기간 경과 후에는 관련 법령에 따라 지체 없이 파기합니다.</p>
            </section>

            <section className="pt-4 border-t border-gray-200">
              <p className="text-gray-500">○ 본 약관은 2025년 09월 30일부터 시행됩니다.</p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
