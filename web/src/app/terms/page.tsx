import Header from "@/components/ui/Header";
import Footer from "@/components/ui/Footer";

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="flex-1 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8">이용약관 (대부거래 표준약관)</h1>

          <div className="space-y-8 text-sm text-gray-700 leading-relaxed">
            <p>
              해당 약관은 법령 및 내부통제기준에 따른 절차를 거쳐 제공됩니다.
            </p>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제1조 (목적)</h2>
              <p>이 약관은 대부업자와 채무자간의 대부거래에 있어서 권리와 의무를 명확히 하고 공정하며 건전한 금전소비대차를 하는 것을 목적으로 한다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제2조 (적용범위)</h2>
              <p>이 약관은 대부업자와 채무자 사이의 가계 또는 기업의 자금대부 또는 그 중개 및 어음할인 등의 금전의 대부와 관련된 대부업자와 채무자 사이의 모든 거래에 적용된다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제3조 (용어의 정의)</h2>
              <p className="mb-2">이 약관에서 사용하는 용어의 정의는 다음과 같다.</p>
              <p className="mb-1">1. &quot;대부업&quot; - 금전의 대부 또는 그 중개 등의 사업</p>
              <p className="mb-1">2. &quot;대부업자&quot; - 관할관청에 등록여부를 불문하고 대부업을 영위하는 개인 및 법인</p>
              <p className="mb-1">3. &quot;채무자&quot; - 대부계약의 체결로 인하여 대부업자에 대하여 채무를 부담하는 자</p>
              <p>4. &quot;보증인&quot; - 채무자가 채무를 이행하지 않는 경우에 그 채무를 대신 이행할 종된 채무를 부담하는자</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제4조 (실명거래)</h2>
              <p>대부업자와 채무자의 거래는 실명에 의하여야 하며, 대부업자는 거래 상대방의 실명 확인을 위한 본인확인 절차를 거쳐야 한다. 대리인에 의한 거래 시에는 위임장 및 대리인의 신분증을 확인하여야 한다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제5조 (약관의 명시·설명·교부)</h2>
              <p>대부업자는 이 약관을 영업장에 비치하여야 하며, 채무자가 요청하는 경우 약관의 사본을 교부하여야 한다. 대부업자는 계약 체결 시 약관의 중요한 내용을 채무자에게 설명하여야 한다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제6조 (계약의 성립)</h2>
              <p>대부계약은 대부업자가 이 약관의 중요한 내용을 채무자에게 설명하고, 채무자가 약관의 내용에 동의한 후 계약서에 서명 또는 기명날인함으로써 성립한다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제7조 (계약서 필수기재사항)</h2>
              <p className="mb-2">대부계약서에는 다음 각 호의 사항이 기재되어야 한다.</p>
              <p className="mb-1">1. 대부업자의 성명 또는 상호</p>
              <p className="mb-1">2. 대부업 등록번호</p>
              <p className="mb-1">3. 대부금액</p>
              <p className="mb-1">4. 이자율 (연이율로 환산한 이자율)</p>
              <p className="mb-1">5. 연체이자율</p>
              <p className="mb-1">6. 변제기간 및 변제방법</p>
              <p className="mb-1">7. 담보에 관한 사항 (담보가 있는 경우)</p>
              <p className="mb-1">8. 보증에 관한 사항 (보증인이 있는 경우)</p>
              <p className="mb-1">9. 부대비용에 관한 사항</p>
              <p className="mb-1">10. 조기상환 조건에 관한 사항</p>
              <p className="mb-1">11. 기한의 이익 상실 사유</p>
              <p>12. 채무자의 성명 및 주소</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제8조 (이자율 등의 제한)</h2>
              <p className="mb-2">대부업자가 개인이나 소규모법인에 대부하는 경우의 이자율은 「대부업 등의 등록 및 금융이용자 보호에 관한 법률」에서 정한 최고이자율을 초과할 수 없다. 이를 초과하는 부분의 이자는 무효로 한다.</p>
              <p>대부업자가 선이자를 사전에 공제한 경우에는 그 공제액을 제외한 실제 수령액을 기준으로 이자율을 산정한다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제9조 (비용의 부담)</h2>
              <p>대부거래에 관련된 채권보전비용, 독촉비용, 증명서 발급비용 등의 부대비용은 관련 법령이 정하는 범위 내에서 채무자가 부담할 수 있으며, 이에 대한 구체적인 사항은 계약서에 기재하여야 한다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제10조 (계약서의 교부 등)</h2>
              <p>대부계약서는 2부를 작성하여 대부업자와 채무자가 각각 1부씩 보관한다. 채무자가 계약서의 반환을 요구하는 경우 대부업자는 이에 응하여야 한다. 전자적 방법에 의한 계약 체결 시에도 계약서 교부 의무는 동일하게 적용된다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제11조 (담보의 제공)</h2>
              <p>채무자의 신용이 현저히 악화되어 채권보전이 어려워질 우려가 있는 경우, 대부업자는 채무자에게 상당한 담보의 제공을 요구할 수 있다. 다만, 이 경우에도 관련 법령이 정하는 절차를 준수하여야 한다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제12조 (기한의 이익의 상실)</h2>
              <p className="mb-2">다음 각 호의 사유가 발생한 경우 채무자는 기한의 이익을 상실하며, 즉시 채무 전액을 변제하여야 한다.</p>
              <p className="mb-1">1. 채무자의 재산에 대하여 압류, 가압류, 가처분이 있는 경우</p>
              <p className="mb-1">2. 채무자가 채무를 이행하지 아니한 경우</p>
              <p className="mb-1">3. 채무자가 파산신청을 받거나 스스로 파산신청을 한 경우</p>
              <p>4. 기타 채권보전을 현저히 해할 사유가 발생한 경우</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제13조 (기한전의 임의 상환 등)</h2>
              <p>채무자는 기한 전이라도 대부금의 전부 또는 일부를 상환할 수 있다. 이 경우 대부업자는 조기상환수수료를 부과할 수 있으며, 그 비율 및 조건은 계약서에 기재된 바에 따른다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제14조 (채무의 변제 등의 충당)</h2>
              <p>채무자의 변제금은 비용, 이자, 원금의 순서로 충당한다. 다만, 채무자와 대부업자 간에 별도의 합의가 있는 경우에는 그에 따를 수 있다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제15조 (영수증 등 서면교부)</h2>
              <p>대부업자는 채무자로부터 변제를 받은 때에는 그 즉시 영수증을 교부하여야 하며, 채무자가 대출잔액 확인서의 교부를 요청하는 경우에는 이에 응하여야 한다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제16조 (통지사항 및 효력)</h2>
              <p>채무자는 주소, 연락처 등 변경사항이 발생한 경우 지체 없이 대부업자에게 통지하여야 한다. 채무자가 통지를 게을리한 경우, 대부업자가 최후로 통지받은 주소 또는 연락처로 발송한 통지는 채무자에게 도달한 것으로 본다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제17조 (채권양도)</h2>
              <p>대부업자가 대부채권을 제3자에게 양도하고자 하는 경우에는 채무자에게 사전 동의를 받아야 한다. 다만, 법령에 의하여 허용되는 경우에는 사후 통지로 갈음할 수 있다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제18조 (신용정보)</h2>
              <p>대부업자는 채무자의 신용정보를 「신용정보의 이용 및 보호에 관한 법률」에서 정하는 범위 내에서만 이용할 수 있으며, 이를 초과하여 이용하거나 제3자에게 제공하여서는 아니 된다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제19조 (이행장소·준거법)</h2>
              <p>대부계약의 이행장소는 대부업자의 영업장 소재지로 하며, 대부계약에 관하여는 대한민국 법률을 적용한다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제20조 (불법적 채권추심 행위의 금지)</h2>
              <p className="mb-2">대부업자 또는 대부업자로부터 채권추심을 위임받은 자는 다음 각 호의 행위를 하여서는 아니 된다.</p>
              <p className="mb-1">1. 채무자 또는 관계인에 대한 폭행, 협박, 체포, 감금 등의 행위</p>
              <p className="mb-1">2. 정당한 사유 없이 반복적으로 또는 야간(오후 9시 이후 ~ 오전 8시 이전)에 채무자를 방문하는 행위</p>
              <p className="mb-1">3. 채무에 관한 거짓 사실을 알리는 행위</p>
              <p>4. 채무자 이외의 자에게 채무에 관한 사실을 알리는 행위</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제21조 (담보물 처분 전 사전통지)</h2>
              <p>대부업자가 담보물을 처분하고자 하는 경우에는 처분 전에 채무자에게 그 사실을 서면으로 통지하여야 하며, 통지 후 상당한 기간이 경과한 후에 처분하여야 한다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제22조 (약관의 변경)</h2>
              <p>대부업자가 이 약관을 변경하고자 하는 경우에는 변경 내용을 채무자에게 서면으로 통지하거나 영업장에 게시하여야 하며, 변경된 약관은 통지 또는 게시일로부터 1개월이 경과한 후부터 효력이 발생한다. 채무자는 약관 변경에 대하여 1개월 이내에 이의를 제기할 수 있다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제23조 (규정의 준용)</h2>
              <p>이 약관에서 정하지 아니한 사항에 대하여는 「대부업 등의 등록 및 금융이용자 보호에 관한 법률」, 「민법」, 「신용정보의 이용 및 보호에 관한 법률」 등 관련 법령을 준용한다.</p>
            </section>

            <section>
              <h2 className="text-lg font-bold text-gray-900 mb-3">제24조 (관할법원의 합의)</h2>
              <p>대부거래에 관한 소송의 관할법원은 대부업자의 거래영업점 소재지를 관할하는 지방법원으로 한다.</p>
            </section>

            <section className="pt-4 border-t border-gray-200">
              <p className="text-gray-500">○ 본 약관은 2025년 09월 30일부터 시행됩니다.</p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
