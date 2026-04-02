import Header from "@/components/ui/Header";
import Footer from "@/components/ui/Footer";

export default function LegalPage() {
  return (
    <>
      <Header />
      <main className="flex-1 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8">책임의 한계와 법적고지</h1>

          <div className="space-y-8 text-sm text-gray-700 leading-relaxed">
            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">적용대상</h2>
              <p>본 법적고지는 데일리에프앤아이대부(이하 &quot;회사&quot;)가 운영하는 웹사이트 이용에 관한 일반적 사항에 대하여 규정하며, 회사의 고객 및 모든 서비스 이용자에게 적용됩니다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">법적고지</h2>
              <p className="mb-3">본 법적고지는 회사의 서비스이용약관과 중복하여 적용됩니다.</p>

              <p className="mb-1"><strong>가. 지적재산권</strong></p>
              <p className="mb-3">본 웹사이트에 게시된 모든 콘텐츠(텍스트, 이미지, 로고, 디자인 등)에 대한 지적재산권은 회사에 귀속됩니다. 사전 서면 동의 없이 이를 복제, 배포, 전송, 수정하는 행위는 관련 법률에 의해 금지됩니다.</p>

              <p className="mb-1"><strong>나. 정보의 정확성</strong></p>
              <p className="mb-3">회사는 본 웹사이트에 게시된 정보의 정확성, 완전성 및 최신성을 보장하지 않습니다. 웹사이트에 게재된 정보는 일반적인 안내 목적으로 제공되며, 이를 근거로 한 의사결정에 대하여 회사는 책임을 지지 않습니다.</p>

              <p className="mb-1"><strong>다. 링크 웹사이트</strong></p>
              <p className="mb-3">본 웹사이트에서 링크된 외부 웹사이트의 내용, 정확성, 안전성에 대하여 회사는 보증하지 않으며, 외부 웹사이트 이용으로 인해 발생하는 손해에 대하여 책임을 지지 않습니다.</p>

              <p className="mb-1"><strong>라. 금지행위</strong></p>
              <p>이용자는 본 웹사이트를 이용함에 있어 다음 각 호의 행위를 하여서는 아니 됩니다.</p>
              <ul className="list-disc pl-5 space-y-1 mt-1">
                <li>회사 또는 제3자의 지적재산권을 침해하는 행위</li>
                <li>웹사이트의 정상적인 운영을 방해하는 행위</li>
                <li>타인의 개인정보를 무단으로 수집, 이용하는 행위</li>
                <li>허위 정보를 게시하거나 전송하는 행위</li>
                <li>관련 법령에 위반되는 행위</li>
              </ul>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">연락처</h2>
              <ul className="space-y-1">
                <li>성명: 백서호</li>
                <li>소속: 데일리에프앤아이대부</li>
                <li>전화: 02-2138-0749</li>
              </ul>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
