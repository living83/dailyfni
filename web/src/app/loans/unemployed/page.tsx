import LandingTemplate from "@/components/sections/LandingTemplate";

export default function UnemployedPage() {
  return (
    <LandingTemplate
      title="무직자 대출"
      subtitle="무직자도 이용 가능한 대출 상품을 안내합니다"
      description="현재 소득이 없는 무직 상태에서도 이용 가능한 대출 상품을 비교하고 중개합니다. 담보 대출, 보증 대출 등 다양한 방법을 안내드립니다."
      eligibility={["만 19세 이상", "담보 제공 가능자 (부동산, 자동차 등)", "보증인 제공 가능자"]}
      interestRate="연 20% 이내 (담보 유형 및 조건에 따라 상이)"
      fees="중개수수료 0% (고객 부담 없음)"
      loanLimit="담보물 가액 및 조건에 따라 상이"
      repayment="원리금균등 / 만기일시 상환"
      steps={[
        { num: "1", title: "상담 신청", desc: "현재 상황 및 보유 자산 안내" },
        { num: "2", title: "상품 탐색", desc: "이용 가능한 상품 탐색 및 비교" },
        { num: "3", title: "심사 진행", desc: "금융사 심사 및 서류 제출" },
        { num: "4", title: "대출 실행", desc: "승인 후 대출 실행" },
      ]}
      faqs={[
        { q: "소득이 전혀 없어도 가능한가요?", a: "담보(부동산, 자동차 등)가 있는 경우 소득 증빙 없이도 대출이 가능한 상품이 있습니다. 상담을 통해 확인해 주세요." },
        { q: "주부도 대출이 가능한가요?", a: "네, 배우자 소득 증빙 또는 담보를 통해 대출이 가능한 경우가 있습니다." },
        { q: "무직자 대출 금리가 더 높은가요?", a: "일반적으로 소득 증빙이 어려운 경우 금리가 높을 수 있습니다. 개인별 조건에 따라 다르므로 상담을 권장합니다." },
      ]}
    />
  );
}
