import Link from "next/link";
import { SITE } from "@/lib/constants";

export default function Footer() {
  return (
    <footer className="mt-auto">
      {/* 빨간 경고문 */}
      <div className="bg-white border-t border-gray-200 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-1">
          <p className="text-error text-lg sm:text-xl font-bold">대출실행시 이자외에 기타비용 일체없음, 중개수수료를 요구하거나 받는 것은 불법입니다.</p>
          <p className="text-error text-lg sm:text-xl font-bold">대출이자 또는 원금연체시 신용상에 불이익을 받으실 수 있습니다.</p>
          <p className="text-error text-lg sm:text-xl font-bold">과도한 빚, 고통의 시작입니다.</p>
          <p className="text-error text-lg sm:text-xl font-bold">대출 시 귀하의 신용등급 또는 개인신용평점이 하락할 수 있습니다.</p>
          <p className="text-error text-lg sm:text-xl font-bold">대출 시 신용등급 또는 개인신용평점 하락으로 다른 금융거래가 제약받을 수 있습니다.</p>
        </div>
      </div>

      {/* 상세 법적 고지사항 */}
      <div className="bg-gray-50 border-t border-gray-200 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4 text-sm sm:text-base text-gray-700 leading-relaxed">
          <p className="font-semibold">
            상호:(주)데일리에프앤아이대부 | Tel:{SITE.phone}
          </p>
          <p>
            이자율 : 연20% 이내 | 연체금리:약정이자율 +3%p이내 (연 20% 이내)<br />
            (2021.07.07부터 신규 체결되거나 갱신, 연장되는 건부터 적용)
          </p>
          <p>
            상환방법 : 원리금균등상환방식, 만기일시상환방식, 부대비용 및 조기상환수수료 없음.<br />
            단, 담보대출은 담보권설정비용(등록세, 지방교육세 등 담보권설정에 직접 필요비용)발생,<br />
            담보권해지비용(담보권해지에 직접 필요비용)발생,<br />
            조기상환수수료 0%~3%발생할 수 있음(기납입이자와 조기상환수수료를 합산한 금액이 연 20% 초과하지 않음)
          </p>
          <p>
            일정 기간 원리금이 연체될 경우 기한의 이익을 상실 할 수 있습니다.<br />
            「금융소비자 보호에 관한 법률」에 따라 금융상품에 관한 중요 사항을 설명 받을 수 있습니다.<br />
            대출시 신용등급 또는 개인신용평점 하락으로 다른 금융거래가 제약 받을 수 있습니다.<br />
            「특정금융거래정보의 보고 및 이용 등에 관한 법률」에 따라<br />
            신원 확인등의 정보 등을 제공 하셔야 하며,<br />
            이를 거부하거나 검증이 불가능 한 경우, 금융거래가 제한될 수 있습니다.
          </p>
          <p>
            신용요건 : 회생/파산상품 - 회생/파산으로 인한 신용 요건 해당없음, 일반신용 - 신용평점600점 이상<br />
            이자는 매월 약정일에 부과 되며, 상환금액은 대출기간 및 상환방법 등<br />
            대출계약 내용에 따라 달라질 수 있음<br />
            (예시:100만원을 연20%로 12개월 동안 원리금균등 상환 시 총 납부금액은 1,111,614원)
          </p>
          <p>계약을 체결하기 전에 자세한 내용은 상품설명서와 약관을 읽어 보시기 바랍니다.</p>
        </div>
      </div>

      {/* 회사 정보 & 바로가기 */}
      <div className="bg-gray-900 text-gray-400 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* 회사 정보 */}
            <div className="md:col-span-2">
              <p className="text-white font-bold text-sm mb-3">DAILY F&I</p>
              <ul className="space-y-1.5 text-xs">
                <li>상호: {SITE.companyName} | 대표: {SITE.ceoName}</li>
                <li>등록번호: {SITE.registrationNumber} ({SITE.registrationType})</li>
                <li>사업자등록번호: {SITE.businessNumber}</li>
                <li>주소: {SITE.address}</li>
                <li>대표전화: {SITE.phone} | 고객불만접수: {SITE.complaintPhone}</li>
              </ul>
            </div>

            {/* 바로가기 */}
            <div>
              <p className="text-white font-bold text-sm mb-3">바로가기</p>
              <ul className="space-y-1.5 text-xs">
                <li><Link href="/terms" className="hover:text-white transition-colors">이용약관</Link></li>
                <li><Link href="/privacy" className="hover:text-white transition-colors font-semibold text-gray-300">개인정보처리방침</Link></li>
                <li><Link href="/legal" className="hover:text-white transition-colors">책임의 한계와 법적고지</Link></li>
                <li><Link href="/sms-terms" className="hover:text-white transition-colors">SMS약관</Link></li>
                <li><Link href="/contact" className="hover:text-white transition-colors">고객문의</Link></li>
                <li><Link href="/apply" className="hover:text-white transition-colors">온라인 신청</Link></li>
              </ul>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-800 text-center text-xs">
            <p>&copy; {new Date().getFullYear()} {SITE.companyName}. All rights reserved.</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
