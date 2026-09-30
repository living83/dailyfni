import Link from "next/link";
import { SITE } from "@/lib/constants";

export default function CtaBanner() {
  return (
    <section className="bg-gradient-to-r from-navy to-deep-blue py-12 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-3">
          지금 바로 무료 상담을 받아보세요
        </h2>
        <p className="text-gray-300 text-sm sm:text-base mb-8 max-w-lg mx-auto">
          고객님의 상황에 맞는 최적의 대출 상품을 안내해 드립니다
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/apply"
            className="inline-flex items-center justify-center px-8 py-3.5 bg-accent hover:bg-accent-hover text-white font-semibold rounded-lg transition-colors"
          >
            온라인 신청하기
            <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          <a
            href={`tel:${SITE.phone}`}
            className="inline-flex items-center justify-center px-8 py-3.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-medium rounded-lg transition-colors"
          >
            <svg className="mr-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            전화 상담 {SITE.phone}
          </a>
        </div>
      </div>
    </section>
  );
}
