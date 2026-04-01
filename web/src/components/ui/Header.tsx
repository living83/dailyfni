"use client";

import { useState } from "react";
import Link from "next/link";
import { LOAN_AREAS } from "@/lib/constants";

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="bg-navy text-white sticky top-0 z-50 shadow-lg">
      {/* 상단 고지 바 */}
      <div className="bg-navy-dark border-b border-navy-light">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-lg sm:text-xl font-bold text-white py-2">
            (주)데일리에프앤아이대부 2024-금감원-2626(대부중개업)
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* 로고 */}
          <Link href="/" className="text-base font-bold tracking-wide text-white">
            DAILY F&I
          </Link>

          {/* 데스크톱 네비게이션 */}
          <nav className="hidden md:flex items-center gap-1">
            {LOAN_AREAS.map((area) => (
              <Link
                key={area.code}
                href={`/loans/${area.code}`}
                className="px-3 py-2 text-sm font-medium text-gray-200 hover:text-white hover:bg-navy-light rounded-md transition-colors"
              >
                {area.shortTitle}
              </Link>
            ))}
            <Link
              href="/contact"
              className="px-3 py-2 text-sm font-medium text-gray-200 hover:text-white hover:bg-navy-light rounded-md transition-colors"
            >
              고객문의
            </Link>
            <Link
              href="/apply"
              className="ml-3 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold rounded-lg transition-colors"
            >
              온라인 신청
            </Link>
          </nav>

          {/* 모바일 메뉴 버튼 */}
          <button
            className="md:hidden p-2 rounded-md hover:bg-navy-light transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="메뉴 열기"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* 모바일 메뉴 */}
        {mobileMenuOpen && (
          <div className="md:hidden pb-4 border-t border-navy-light">
            <div className="pt-2 space-y-1">
              {LOAN_AREAS.map((area) => (
                <Link
                  key={area.code}
                  href={`/loans/${area.code}`}
                  className="block px-3 py-2 text-sm font-medium text-gray-200 hover:text-white hover:bg-navy-light rounded-md"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {area.title}
                </Link>
              ))}
              <Link
                href="/contact"
                className="block px-3 py-2 text-sm font-medium text-gray-200 hover:text-white hover:bg-navy-light rounded-md"
                onClick={() => setMobileMenuOpen(false)}
              >
                고객문의
              </Link>
              <Link
                href="/apply"
                className="block mx-3 mt-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-semibold rounded-lg text-center"
                onClick={() => setMobileMenuOpen(false)}
              >
                온라인 신청
              </Link>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
