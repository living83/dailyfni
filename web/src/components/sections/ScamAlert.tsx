import Link from "next/link";
import { SITE } from "@/lib/constants";

/**
 * 보이스피싱·사칭 경고
 * - variant="section" : 홈 등 본문에 넣는 강조 블록
 * - variant="strip"   : 푸터 상단 등 전 페이지 공통 슬림 배너
 */
export default function ScamAlert({
  variant = "section",
}: {
  variant?: "section" | "strip";
}) {
  if (variant === "strip") {
    return (
      <div className="bg-error/5 border-t border-b border-error/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-error/10 px-3 py-1 text-xs sm:text-sm font-bold text-error ring-1 ring-error/30">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            보이스피싱 주의
          </span>
          <p className="flex-1 text-sm sm:text-base text-gray-700 leading-relaxed">
            당사는 <span className="font-bold text-gray-900">대출 권유·광고 목적의 전화나 문자메시지를 일절 발송하지 않습니다.</span>{" "}
            <span className="font-bold text-gray-900">&lsquo;서○○ 팀장&rsquo;</span>은 당사 직원이 아닙니다.
            신청하지 않으셨는데 당사 명의로 대출 연락을 받으셨다면 보이스피싱입니다.
          </p>
          <Link
            href="/notice"
            className="shrink-0 inline-flex items-center justify-center rounded-lg border border-error/30 bg-white px-4 py-2 text-sm font-semibold text-error hover:bg-error/5 transition-colors"
          >
            공지 자세히 보기
            <svg className="ml-1.5 w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="scam-alert-heading" className="bg-white py-10 sm:py-14">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border-2 border-error/30 bg-error/[0.03] p-6 sm:p-9">
          <div className="flex flex-col sm:flex-row gap-5">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-error/10 text-error ring-1 ring-error/20">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </span>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-error px-2.5 py-0.5 text-xs font-bold text-white">중요 공지</span>
                <span className="text-sm text-gray-500 tabular-nums">2026.09.30</span>
              </div>

              <h2 id="scam-alert-heading" className="mt-2.5 text-xl sm:text-2xl font-bold text-gray-900 leading-snug">
                당사 사칭 대출 문자 · 전화는 보이스피싱입니다
              </h2>
              <p className="mt-3 text-sm sm:text-base text-gray-700 leading-relaxed">
                최근 {SITE.companyName} 및 당사 임직원을 사칭하여 대출을 권유하거나 금전을 요구하는 사례가 확인되고 있습니다.
                고객님의 피해 예방을 위해 다음 사항을 분명히 안내드립니다.
              </p>

              <ul className="mt-6 space-y-3">
                {[
                  {
                    title: "대출 권유·광고 문자와 전화를 발송하지 않습니다",
                    body: "당사는 불특정 다수에게 대출 광고 문자메시지(SMS)·카카오톡·SNS 메시지를 보내거나 대출을 권유하는 전화를 걸지 않습니다. 당사가 연락드리는 경우는 고객님이 직접 상담을 신청하신 건에 대한 회신에 한합니다.",
                  },
                  {
                    title: "‘서○○ 팀장’은 당사 임직원이 아닙니다",
                    body: "‘서○○ 팀장’이라는 명의로 당사 임직원을 사칭하는 연락이 확인되고 있습니다. 해당 인물은 당사에 재직하고 있지 않으며, 당사와 어떠한 위임·대리·업무 위탁 관계도 없습니다.",
                  },
                  {
                    title: "신청하지 않은 대출 연락은 100% 사칭입니다",
                    body: "상담을 신청하신 적이 없는데 당사 명의의 대출 승인·한도 조회·저금리 전환 안내를 받으셨다면 보이스피싱이므로 응답하지 마시고 즉시 신고해 주십시오.",
                  },
                  {
                    title: "중개수수료·선입금 요구는 모두 불법입니다",
                    body: "당사는 어떠한 경우에도 수수료·보증금·공탁금·보험료 명목의 선입금, 개인 계좌 송금, 앱 설치나 원격제어를 요구하지 않습니다.",
                  },
                ].map((item) => (
                  <li key={item.title} className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5">
                    <p className="flex items-start gap-2 font-bold text-gray-900 text-[15px] sm:text-base leading-snug">
                      <svg className="w-5 h-5 shrink-0 text-error mt-0.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      {item.title}
                    </p>
                    <p className="mt-1.5 pl-7 text-sm text-gray-600 leading-relaxed">{item.body}</p>
                  </li>
                ))}
              </ul>

              <div className="mt-6 rounded-xl bg-gray-50 border border-gray-200 p-4 sm:p-5">
                <p className="text-sm font-bold text-gray-900">확인 및 신고 창구</p>
                <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  <div className="flex items-baseline justify-between gap-3 border-b border-gray-200 pb-1.5">
                    <dt className="text-gray-500 shrink-0">당사 대표전화</dt>
                    <dd><a href={`tel:${SITE.phone}`} className="font-semibold text-gray-900 tabular-nums hover:text-accent">{SITE.phone}</a></dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-b border-gray-200 pb-1.5">
                    <dt className="text-gray-500 shrink-0">한국대부금융협회</dt>
                    <dd><a href="tel:02-3487-5800" className="font-semibold text-gray-900 tabular-nums hover:text-accent">02-3487-5800</a></dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-b border-gray-200 pb-1.5">
                    <dt className="text-gray-500 shrink-0">금융감독원 불법사금융 신고</dt>
                    <dd><a href="tel:1332" className="font-semibold text-gray-900 tabular-nums hover:text-accent">1332</a></dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-b border-gray-200 pb-1.5">
                    <dt className="text-gray-500 shrink-0">경찰청 보이스피싱 신고</dt>
                    <dd><a href="tel:112" className="font-semibold text-gray-900 tabular-nums hover:text-accent">112</a></dd>
                  </div>
                </dl>
                <p className="mt-4 text-xs sm:text-sm text-gray-500 leading-relaxed">
                  당사를 사칭한 행위에 대해서는 관련 법령에 따라 법적 조치를 진행하고 있으며,
                  사칭으로 인한 피해에 대하여 당사는 책임을 지지 않습니다.
                </p>
              </div>

              <p className="mt-6 text-sm text-gray-500 tabular-nums">2026. 09. 30. &nbsp;{SITE.companyName}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
