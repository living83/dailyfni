import LandingTemplate from "@/components/sections/LandingTemplate";

export default function CreditPage() {
  return (
    <LandingTemplate
      title="신용대출"
      subtitle="내 신용등급에 맞는 최적의 대출 상품을 비교합니다"
      description="개인 신용을 기반으로 한 다양한 대출 상품을 비교하고 중개합니다. 여러 금융사의 조건을 한눈에 비교하여 고객님께 가장 유리한 상품을 안내합니다."
      eligibility={["만 19세 이상", "소득 증빙 가능자", "재직 중인 직장인 또는 사업자"]}
      interestRate="연 20% 이내 (개인 신용등급에 따라 상이)"
      fees="중개수수료 0% (고객 부담 없음)"
      loanLimit="개인별 신용도 및 소득에 따라 상이"
      repayment="원리금균등 / 만기일시 상환"
      steps={[
        { num: "1", title: "상담 신청", desc: "기본 정보 및 희망 조건 입력" },
        { num: "2", title: "상품 비교", desc: "다양한 금융사 조건 비교" },
        { num: "3", title: "심사 진행", desc: "선택 금융사 심사 진행" },
        { num: "4", title: "대출 실행", desc: "승인 후 대출금 입금" },
      ]}
      faqs={[
        { q: "신용등급이 낮아도 가능한가요?", a: "신용등급에 따라 이용 가능한 상품이 다릅니다. 상담을 통해 고객님의 신용등급에 맞는 상품을 안내드립니다." },
        { q: "심사 기간은 얼마나 걸리나요?", a: "금융사별로 다르지만 일반적으로 1~3 영업일 소요됩니다." },
        { q: "기존 대출이 있어도 추가 대출이 가능한가요?", a: "기존 대출 현황과 총 부채 비율에 따라 추가 대출 가능 여부가 결정됩니다. 상담을 통해 확인하시기 바랍니다." },
      ]}
    />
  );
}
