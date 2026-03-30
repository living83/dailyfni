import Link from "next/link";
import { SITE, COMMON_LEGAL_NOTICE } from "@/lib/constants";

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 mt-auto">
      {/* 법적 고지 */}
      <div className="bg-gray-800 border-t border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-xs leading-relaxed whitespace-pre-line text-gray-400">
            {COMMON_LEGAL_NOTICE}
          </p>
        </div>
      </div>

      {/* 회사 정보 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* 회사 정보 */}
          <div>
            <h3 className="text-white font-semibold text-sm mb-3">회사 정보</h3>
            <ul className="space-y-1.5 text-xs">
              <li>상호: {SITE.companyName}</li>
              <li>대표: {SITE.ceoName}</li>
              <li>사업자등록번호: {SITE.businessNumber}</li>
              <li>주소: {SITE.address}</li>
            </ul>
          </div>

          {/* 연락처 */}
          <div>
            <h3 className="text-white font-semibold text-sm mb-3">고객센터</h3>
            <ul className="space-y-1.5 text-xs">
              <li>
                대표전화:{" "}
                <a
                  href={`tel:${SITE.phone}`}
                  className="text-gray-300 hover:text-white"
                >
                  {SITE.phone}
                </a>
              </li>
              <li>
                이메일:{" "}
                <a
                  href={`mailto:${SITE.email}`}
                  className="text-gray-300 hover:text-white"
                >
                  {SITE.email}
                </a>
              </li>
              <li>운영시간: 평일 09:00 ~ 18:00 (주말/공휴일 휴무)</li>
            </ul>
          </div>

          {/* 바로가기 */}
          <div>
            <h3 className="text-white font-semibold text-sm mb-3">바로가기</h3>
            <ul className="space-y-1.5 text-xs">
              <li>
                <Link href="/terms" className="hover:text-white transition-colors">
                  이용약관
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="hover:text-white transition-colors font-semibold text-gray-300"
                >
                  개인정보처리방침
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-white transition-colors">
                  고객문의
                </Link>
              </li>
              <li>
                <Link href="/apply" className="hover:text-white transition-colors">
                  온라인 신청
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* 보안 인증 & 카피라이트 */}
        <div className="mt-8 pt-6 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-gray-800 px-3 py-1.5 rounded-full">
              <svg className="w-4 h-4 text-success" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-xs text-gray-300">SSL 보안 적용</span>
            </div>
            <div className="flex items-center gap-1.5 bg-gray-800 px-3 py-1.5 rounded-full">
              <svg className="w-4 h-4 text-success" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-xs text-gray-300">정식 등록 업체</span>
            </div>
          </div>
          <p className="text-xs">
            &copy; {new Date().getFullYear()} {SITE.companyName}. All rights
            reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
