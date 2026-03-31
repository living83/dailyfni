import Link from "next/link";
import { LOAN_AREAS, COMMON_LEGAL_NOTICE } from "@/lib/constants";

export default function LoanSections() {
  return (
    <section className="py-12 sm:py-16 lg:py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10 sm:mb-14">
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
            대출 상품 안내
          </h2>
          <p className="text-gray-500 text-sm sm:text-base max-w-2xl mx-auto">
            고객님의 상황에 맞는 최적의 대출 상품을 투명하게 중개합니다
          </p>
        </div>

        <div className="space-y-6">
          {/* 1순위: 회생,파산,신용회복 - 풀 와이드 */}
          {LOAN_AREAS.filter((a) => a.priority === 1).map((area) => (
            <div
              key={area.code}
              className="relative bg-gradient-to-r from-navy to-deep-blue rounded-2xl p-8 sm:p-10 text-white overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
              <div className="relative">
                <span className="inline-block bg-white/20 text-xs font-semibold px-3 py-1 rounded-full mb-4">
                  추천
                </span>
                <h3 className="text-xl sm:text-2xl font-bold mb-2">{area.title}</h3>
                <p className="text-gray-300 text-sm sm:text-base mb-6 max-w-xl">
                  {area.description}
                </p>
                <div className="flex flex-wrap gap-3 mb-6">
                  {area.highlights.map((h) => (
                    <span
                      key={h}
                      className="bg-white/10 border border-white/20 text-xs sm:text-sm px-3 py-1.5 rounded-lg"
                    >
                      {h}
                    </span>
                  ))}
                </div>
                <Link
                  href={`/loans/${area.code}`}
                  className="inline-flex items-center px-6 py-3 bg-accent hover:bg-accent-hover text-white font-semibold rounded-lg transition-colors text-sm"
                >
                  무료 상담 신청
                  <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          ))}

          {/* 2~3순위: 오토론, 신용대출 - 2컬럼 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {LOAN_AREAS.filter((a) => a.priority >= 2 && a.priority <= 3).map((area) => (
              <div
                key={area.code}
                className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 hover:shadow-lg hover:border-gray-300 transition-all group"
              >
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 group-hover:text-accent transition-colors">
                  {area.title}
                </h3>
                <p className="text-gray-500 text-sm mb-5">{area.description}</p>
                <div className="flex flex-wrap gap-2 mb-5">
                  {area.highlights.map((h) => (
                    <span
                      key={h}
                      className="bg-gray-100 text-gray-600 text-xs px-2.5 py-1 rounded-md"
                    >
                      {h}
                    </span>
                  ))}
                </div>
                <Link
                  href={`/loans/${area.code}`}
                  className="inline-flex items-center text-accent hover:text-accent-hover font-medium text-sm transition-colors"
                >
                  자세히 보기
                  <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            ))}
          </div>

          {/* 4~5순위: 무직자, 부동산 - 2컬럼 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {LOAN_AREAS.filter((a) => a.priority >= 4).map((area) => (
              <div
                key={area.code}
                className="bg-gray-50 border border-gray-200 rounded-2xl p-6 sm:p-8 hover:shadow-md hover:border-gray-300 transition-all group"
              >
                <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-accent transition-colors">
                  {area.title}
                </h3>
                <p className="text-gray-500 text-sm mb-5">{area.description}</p>
                <div className="flex flex-wrap gap-2 mb-5">
                  {area.highlights.map((h) => (
                    <span
                      key={h}
                      className="bg-white text-gray-600 text-xs px-2.5 py-1 rounded-md border border-gray-200"
                    >
                      {h}
                    </span>
                  ))}
                </div>
                <Link
                  href={`/loans/${area.code}`}
                  className="inline-flex items-center text-accent hover:text-accent-hover font-medium text-sm transition-colors"
                >
                  자세히 보기
                  <svg className="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* 법적 고지 요약 */}
        <div className="mt-10 p-4 bg-gray-50 border border-gray-200 rounded-xl">
          <p className="text-[10px] sm:text-xs text-gray-400 leading-relaxed whitespace-pre-line">
            {COMMON_LEGAL_NOTICE}
          </p>
        </div>
      </div>
    </section>
  );
}
