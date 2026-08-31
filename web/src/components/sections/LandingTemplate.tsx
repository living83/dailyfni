import Link from "next/link";
import Header from "@/components/ui/Header";
import Footer from "@/components/ui/Footer";
import { SITE, COMMON_LEGAL_NOTICE } from "@/lib/constants";

interface LandingProps {
  title: string;
  subtitle: string;
  description: string;
  eligibility: string[];
  interestRate: string;
  fees: string;
  repayment: string;
  loanLimit: string;
  steps: { num: string; title: string; desc: string }[];
  faqs: { q: string; a: string }[];
  areaNotice?: string;
}

export default function LandingTemplate({
  title, subtitle, description,
  eligibility, interestRate, fees, repayment, loanLimit,
  steps, faqs, areaNotice,
}: LandingProps) {
  return (
    <>
      <Header />
      <main className="flex-1">
        {/* 히어로 */}
        <section className="bg-gradient-to-br from-navy-dark via-navy to-deep-blue text-white py-16 sm:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-3">{title}</h1>
            <p className="text-gray-300 text-base sm:text-lg mb-6 max-w-2xl">{subtitle}</p>
            <Link
              href="/apply"
              className="inline-flex items-center px-6 py-3 bg-accent hover:bg-accent-hover text-white font-semibold rounded-lg transition-colors"
            >
              무료 상담 신청
              <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </section>

        {/* 서비스 설명 */}
        <section className="py-12 sm:py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">서비스 안내</h2>
            <p className="text-gray-600 text-sm sm:text-base leading-relaxed max-w-3xl">{description}</p>
          </div>
        </section>

        {/* 대출 조건 */}
        <section className="py-12 sm:py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">대출 조건 안내</h2>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-gray-100">
                    <td className="px-5 py-4 bg-gray-50 font-medium text-gray-700 w-32">자격 조건</td>
                    <td className="px-5 py-4 text-gray-600">
                      <ul className="space-y-1">
                        {eligibility.map((e) => (<li key={e}>• {e}</li>))}
                      </ul>
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="px-5 py-4 bg-gray-50 font-medium text-gray-700">금리</td>
                    <td className="px-5 py-4 text-gray-600">{interestRate}</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="px-5 py-4 bg-gray-50 font-medium text-gray-700">수수료</td>
                    <td className="px-5 py-4 text-gray-600">{fees}</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="px-5 py-4 bg-gray-50 font-medium text-gray-700">대출 한도</td>
                    <td className="px-5 py-4 text-gray-600">{loanLimit}</td>
                  </tr>
                  <tr>
                    <td className="px-5 py-4 bg-gray-50 font-medium text-gray-700">상환 방식</td>
                    <td className="px-5 py-4 text-gray-600">{repayment}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 신청 절차 */}
        <section className="py-12 sm:py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-8">신청 절차</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {steps.map((s) => (
                <div key={s.num} className="bg-gray-50 rounded-xl p-5 text-center">
                  <div className="w-10 h-10 bg-accent text-white rounded-full flex items-center justify-center font-bold mx-auto mb-3">
                    {s.num}
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">{s.title}</h3>
                  <p className="text-xs text-gray-500">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-12 sm:py-16 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-6">자주 묻는 질문</h2>
            <div className="space-y-3">
              {faqs.map((faq) => (
                <details key={faq.q} className="bg-white border border-gray-200 rounded-xl group">
                  <summary className="px-5 py-4 cursor-pointer font-medium text-gray-800 text-sm flex items-center justify-between">
                    {faq.q}
                    <svg className="w-5 h-5 text-gray-400 group-open:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </summary>
                  <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed">{faq.a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 하단 CTA */}
        <section className="bg-gradient-to-r from-navy to-deep-blue py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-4">지금 바로 상담받으세요</h2>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/apply" className="inline-flex items-center justify-center px-8 py-3 bg-accent hover:bg-accent-hover text-white font-semibold rounded-lg transition-colors">
                무료 상담 신청
              </Link>
              <a href={`tel:${SITE.phone}`} className="inline-flex items-center justify-center px-8 py-3 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium rounded-lg transition-colors">
                전화 {SITE.phone}
              </a>
            </div>
          </div>
        </section>

        {/* 법적 고지 */}
        <div className="bg-gray-100 py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-[10px] sm:text-xs text-gray-400 leading-relaxed whitespace-pre-line">
              {COMMON_LEGAL_NOTICE}
              {areaNotice ? `\n\n${areaNotice}` : ""}
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
