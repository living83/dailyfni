import Header from "@/components/ui/Header";
import Footer from "@/components/ui/Footer";

export default function PrivacyPage() {
  return (
    <>
      <Header />
      <main className="flex-1 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8">개인정보처리방침</h1>

          <div className="space-y-8 text-sm text-gray-700 leading-relaxed">
            <p>
              데일리에프앤아이대부 (이하 &quot;회사&quot;라고 함)는 「개인정보 보호법」, 「신용정보의 이용 및 보호에 관한 법률」 정보통신망 이용촉진 및 정보보호 등에 관한 법률」, 「통신비밀 보호법」등 관련 법령에 따라 고객의 개인정보 및 권익을 보호하고 개인정보와 관련한 고객의 고충을 원활하게 처리할 수 있도록 다음과 같은 취급방침을 두고 있습니다.
            </p>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제1조(개인정보의 처리 목적)</h2>
              <p className="mb-2">회사는 개인정보를 다음 각 호의 목적을 위해 처리합니다. 처리한 개인정보는 다음의 목적 외의 용도로는 사용되지 않으며 이용 목적이 변경될 시에는 사전동의를 구할 예정입니다.</p>
              <p className="mb-1"><strong>가. 대부중개에 관한 목적</strong></p>
              <p className="mb-2">개인 대출 계약과 관련하여 금융거래 관계의 설정 여부의 판단, 대출 계약의 체결, 분쟁 해결, 민원 처리 및 법령상 의무이행 등의 목적으로 개인정보를 처리합니다.</p>
              <p className="mb-1"><strong>나. 마케팅 및 광고에 활용</strong></p>
              <p>신규 대출상품 소개 및 맞춤 서비스 제공, 이벤트, 광고성 정보 제공 및 참여기회 제공, 인구통계학적 특성에 따른 서비스 제공 및 광고의 게재, 서비스의 유효성 확인, 경품지급, 사은행사 등 고객의 편의 및 참여기회 제공, 접속빈도 파악, 회원의 서비스이용에 대한 통계 등의 목적으로 개인정보를 처리합니다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제2조(처리하는 개인정보의 항목)</h2>
              <p className="mb-2">회사는 대출 계약의 체결, 유지, 이행 관리 및 상품서비스의 제공을 위한 필수정보 및 선택정보를 다음 각 호와 같이 수집하고 있습니다.</p>
              <p className="mb-1"><strong>가. 개인정보의 항목</strong></p>
              <p className="mb-1">(1) 개인식별정보: 성명, 주소, 성별, 국적, 직업, 연락처 등 대출에 필요한 정보</p>
              <p className="mb-2">(2) 신용거래정보: 대출, 보증, 담보, 현금서비스, 신용카드 등 사용 내역</p>
              <p className="mb-1"><strong>나. 수집방법</strong></p>
              <p className="mb-1">(1) 서면양식, 홈페이지, 이메일, 전화/팩스, 경품행사, 제휴사로부터의 제공</p>
              <p>(2) 고객센터를 통한 수집</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제3조(개인정보의 처리 및 보유 기간)</h2>
              <p className="mb-2">법령에 따른 개인정보 보유, 이용기간 또는 고객으로부터 개인정보를 수집 시에 동의 받은 개인정보 보유, 이용기간 내에서 처리 또는 보유합니다. 법령에 따른 개인정보 보유, 이용 기간은 다음과 같습니다.</p>
              <p className="mb-1"><strong>가. 신용정보의 수집/처리 및 이용 등에 관한 기록</strong></p>
              <p className="mb-1">(1) 보존 이유 : 신용정보의 이용 및 보호에 관한 법률</p>
              <p className="mb-2">(2) 보존 기간 : 3년</p>
              <p className="mb-1"><strong>나. 소비자의 불만 또는 분쟁처리에 관한 기록</strong></p>
              <p className="mb-1">(1) 보존 이유 : 전자상거래 등에서의 소비자보호에 관한 법률</p>
              <p className="mb-2">(2) 보존 기간 : 3년</p>
              <p className="mb-1"><strong>다. 웹 사이트 방문기록</strong></p>
              <p className="mb-1">(1) 보존 이유 : 정보통신망 이용촉진 및 정보보호 등에 관한 법률</p>
              <p className="mb-2">(2) 보존 기간 : 3개월</p>
              <p className="mb-1"><strong>라. 표시, 광고에 관한 기록</strong></p>
              <p className="mb-1">(1) 보존 이유 : 전자상거래 등에서의 소비자 보호에 관한 법률</p>
              <p>(2) 보존 기간 : 6개월</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제4조(개인정보의 제3자 제공)</h2>
              <p className="mb-2">회사는 원칙적으로 고객의 개인정보를 제1조에서 명시한 목적 범위 내에서 처리하며, 고객의 사전 동의 없이는 본래의 범위를 초과하여 처리하거나 제3자에게 제공하지 않습니다. 단, 법률의 규정에 의한 정보 제공과 기타 법령이 허용한 하부 위탁이 가능한 범위 내에서는 고객 또는 제3자의 이익을 부당하게 침해할 우려가 있을 때를 제외하고는 개인정보를 목적 외의 용도로 이용하거나 이를 제3자에게 제공할 수 있습니다.</p>
              <p className="mb-1"><strong>가. 제휴회사에 개인신용정보 제공</strong></p>
              <p className="mb-2">(1) 제공업체: 제휴 대부업체 및 대부중개업체</p>
              <p className="mb-1"><strong>나. 제공받는 신용정보의 내용</strong></p>
              <p className="mb-2">(1) 성명, 생년월일, 성별, 주소, 직업, 국적, 연락처 등의 식별정보 및 대출에 필요한 서류 및 정보</p>
              <p className="mb-1"><strong>다. 제공받는 자의 이용 목적 및 정보 보유, 이용기간</strong></p>
              <p className="mb-1">(1) 제공목적: 대출접수 및 신청, 중개수수료 정산</p>
              <p>(2) 보유 및 이용기간: 제공 동의일로부터 개인정보의 제공목적을 달성할 때까지. 단, 제공목적 달성 후에는 위에 기재된 이용목적과 관련된 금융사고 조사, 분쟁해결, 민원처리, 법령상 의무이행을 위하여 필요한 범위 내에서만 보유, 이용됩니다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제5조(개인정보 자동 수집 장치의 설치, 운영 및 거부 관련사항)</h2>
              <p>회사는 고객께서 홈페이지에 접속하신 상태에서 &apos;쿠키&apos;를 이용하고 있습니다. 쿠키는 이용자 사이트에 대한 기본 설정정보를 보관하기 위해 해당 웹사이트가 사용자의 컴퓨터 브라우저에 전송하는 소량의 정보입니다. 쿠키 이용에 대한 선택권은 고객이 가지고 있습니다. 고객님의 웹 브라우저에서 모든 쿠키를 허용하거나, 쿠키가 저장될 때마다 확인을 거치거나, 모든 쿠키의 저장을 거부하는 등의 옵션을 선택하실 수 있습니다. 단, 고객이 쿠키의 저장을 거부하는 옵션을 선택하시는 경우에는 서비스 이용에 불편이 야기될 수 있습니다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제8조(개인정보의 파기)</h2>
              <p className="mb-1"><strong>가. 파기 절차</strong></p>
              <p className="mb-2">이용자가 입력한 정보는 목적 달성 후 별도의 DB에 옮겨져(종이의 경우 별도의 서류) 내부 방침 및 기타관련 법령에 따라 일정기간 저장 후 혹은 즉시 파기됩니다. 이 때, 옮겨진 개인정보는 법령의 규정에 의한 경우를 제외하고는 다른목적으로 이용되지 않습니다.</p>
              <p className="mb-1"><strong>나. 파기 기한</strong></p>
              <p className="mb-2">이용자의 개인정보는 보유기간일로부터 즉시파기, 개인정보의 처리 목적 달성, 해당 서비스의 폐지, 사업의 종료 등 그 개인정보가 불필요하게 되었을 때에는 개인정보의 처리가 불필요한 것으로 인정되는 날로부터 즉시 개인정보를 파기합니다.</p>
              <p className="mb-1"><strong>다. 파기 방법</strong></p>
              <p>전자적 파일 형태의 정보는 기록을 재생할 수 없는 기술적 방법을 사용합니다. 종이에 출력된 개인정보는 분쇄기로 분쇄하거나 소각을 통하여 파기합니다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제9조(개인정보의 안전성 확보 조치)</h2>
              <p className="mb-2">회사는 개인정보보호법 제29조에 따라 다음 각 호와 같이 안전성 확보에 필요한 기술적/관리적 및 물리적 조치를 하고 있습니다.</p>
              <p className="mb-1"><strong>가. 개인정보의 암호화</strong></p>
              <p className="mb-2">고객의 비밀번호는 암호화 되어 저장 및 관리되고 있어, 본인만이 알 수 있으며 중요한 데이터는 파일 및 전송 데이터를 암호화 하거나 파일 잠금 기능을 사용하는 등의 별도 보안기능을 사용하고 있습니다.</p>
              <p className="mb-1"><strong>나. 해킹 등에 대비한 기술적 대책</strong></p>
              <p className="mb-2">회사는 외부로부터 접근이 통제된 구역에 시스템을 설치하는 등 기술적, 물리적으로 감시 및 차단하고 있습니다.</p>
              <p className="mb-1"><strong>다. 개인정보처리시스템 접근 제한</strong></p>
              <p className="mb-2">개인정보를 처리하는 데이터베이스시스템에 대한 접근권한의 부여, 변경, 말소를 통하여 개인정보에 대한 접근통제를 위하여 필요한 조치를 하고 있으며 침입차단시스템을 이용하여 외부로부터의 무단 접근을 통제하고 있습니다.</p>
              <p className="mb-1"><strong>라. 개인정보 취급 직원의 최소화 및 교육</strong></p>
              <p>개인정보를 취급하는 직원을 지정하고 담당자에 한정시켜 최소화 하여 개인정보를 관리하는 대책을 시행하고 있습니다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제10조(개인정보 처리방침의 변경)</h2>
              <p>회사가 법령 및 방침에 따라 개인정보 처리방침을 변경하는 경우에는 변경 및 시행의 시기, 변경된 내용을 공지사항을 통하여 공개합니다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제11조(권익침해 구제방법)</h2>
              <p className="mb-2">고객께서 개인정보침해로 인한 신고나 상담이 필요하신 경우 회사의 민원센터 또는 아래 기관에 문의하시기 바랍니다.</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>개인정보분쟁조정위원회</li>
                <li>한국인터넷진흥원 개인정보침해신고센터 (www.kopico.or.kr / 02-1336)</li>
                <li>정보보호마크인증위원회 (www.eprivacy.or.kr / 02-580-0533~4)</li>
                <li>대검찰청 첨단범죄수사과 (www.spo.go.kr / 02-3480-2000)</li>
                <li>경찰청 사이버테러대응센터 (www.ctrc.go.kr / 02-392-0330)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제12조(개인정보 관리책임자)</h2>
              <p className="mb-2">개인정보 보호법 제31조 제1항에 따른 회사의 개인정보 보호책임자는 다음과 같습니다.</p>
              <p className="mb-1"><strong>가. 개인정보관리책임자</strong></p>
              <ul className="space-y-1 mb-2">
                <li>성명 : 백서호</li>
                <li>직급 : 감사</li>
                <li>전화번호 : 02-2138-0749</li>
                <li>주소 : 서울특별시 금천구 서부샛길606 대성디폴리스지식산업센터 비동 2604-1호</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제13조(고지)</h2>
              <p>현 개인정보 처리방침 내용의 추가, 삭제 및 수정이 있을 시에는 개정 최소 7일전부터 홈페이지의 &apos;공지사항&apos;을 통해 고지할 것입니다.</p>
            </section>

            <section className="pt-4 border-t border-gray-200">
              <p className="text-gray-500">○ 본 방침은 2025년 09월 30일부터 시행됩니다.</p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
