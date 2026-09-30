import Header from "@/components/ui/Header";
import Footer from "@/components/ui/Footer";
import { SITE } from "@/lib/constants";

export default function ContactPage() {
  return (
    <>
      <Header />
      <main className="flex-1 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8">고객문의</h1>

          {/* 연락 채널 카드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
            <a href={`tel:${SITE.phone}`} className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-accent/10 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <h2 className="font-bold text-gray-900">전화 상담</h2>
              </div>
              <p className="text-lg font-semibold text-accent mb-1">{SITE.phone}</p>
              <p className="text-sm text-gray-500">평일 09:00 ~ 18:00</p>
            </a>
            <a href={`mailto:${SITE.email}`} className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-accent/10 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="font-bold text-gray-900">이메일 문의</h2>
              </div>
              <p className="text-lg font-semibold text-accent mb-1">{SITE.email}</p>
              <p className="text-sm text-gray-500">24시간 접수 가능</p>
            </a>
          </div>

          {/* 고객불만 접수 */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-10">
            <h2 className="font-bold text-gray-900 mb-2">고객불만 접수</h2>
            <p className="text-sm text-gray-500 mb-1">전화: <a href={`tel:${SITE.complaintPhone}`} className="text-accent">{SITE.complaintPhone}</a></p>
            <p className="text-sm text-gray-500">서비스 이용 중 불편사항이 있으시면 언제든지 연락해 주세요.</p>
          </div>

          {/* 회사 정보 */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="font-bold text-gray-900 mb-3">회사 정보</h2>
            <ul className="space-y-1.5 text-sm text-gray-600">
              <li>상호: {SITE.companyName}</li>
              <li>대표: {SITE.ceoName}</li>
              <li>등록번호: {SITE.registrationNumber} ({SITE.registrationType})</li>
              <li>사업자등록번호: {SITE.businessNumber}</li>
              <li>주소: {SITE.address}</li>
            </ul>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
