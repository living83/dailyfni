"use client";

import { useState } from "react";
import Link from "next/link";
import { SITE, CARRIERS, COMMON_LEGAL_NOTICE } from "@/lib/constants";

export default function ApplyPage() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: "",
    carrier: "",
    phone: "",
    consent: false,
    employmentType: "",
    has4Insurance: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [consentWarning, setConsentWarning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const updateField = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
    if (field === "consent") setConsentWarning(false);
  };

  // 전화번호 하이픈 자동 삽입
  const formatPhone = (value: string) => {
    const nums = value.replace(/[^0-9]/g, "").slice(0, 11);
    if (nums.length <= 3) return nums;
    if (nums.length <= 7) return `${nums.slice(0, 3)}-${nums.slice(3)}`;
    return `${nums.slice(0, 3)}-${nums.slice(3, 7)}-${nums.slice(7)}`;
  };

  // 전산 API 전송 (실패해도 무시 — 고객 경험에 영향 없음)
  const sendToSystem = (data: Record<string, string>) => {
    const endpoint = process.env.NEXT_PUBLIC_INTAKE_API || "http://localhost:3000/api/intake/homepage";
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => {
      // 전산 연동 실패는 백그라운드 처리, 고객에게 영향 없음
      console.warn("[전산 연동 실패] 데이터:", data);
    });
  };

  const handleStep1Submit = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name || formData.name.trim().length < 2)
      newErrors.name = "이름을 2자 이상 입력해 주세요.";
    if (!formData.carrier) newErrors.carrier = "통신사를 선택해 주세요.";
    if (!formData.phone || !/^01[016789]\d{7,8}$/.test(formData.phone.replace(/-/g, "")))
      newErrors.phone = "올바른 전화번호를 입력해 주세요.";

    if (!formData.consent) {
      setConsentWarning(true);
      newErrors.consent = "개인정보 이용 및 취득에 동의해 주셔야 접수가 가능합니다.";
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSubmitting(true);

    // 1차 전송: 전산에 백그라운드 전송 (실패해도 접수 완료 처리)
    sendToSystem({
      name: formData.name.trim(),
      phone: formData.phone.replace(/-/g, ""),
      content: `통신사: ${formData.carrier}`,
      source: "홈페이지",
    });

    // 고객에게는 즉시 접수 완료 → 다음 단계
    setSubmitting(false);
    setStep(2);
  };

  const handleStep2Submit = () => {
    if (!formData.employmentType) return;
    if (formData.employmentType === "employed") {
      setStep(3);
    } else {
      // 2차 전송: 추가 정보 백그라운드 전송
      sendToSystem({
        name: formData.name.trim(),
        phone: formData.phone.replace(/-/g, ""),
        content: `통신사: ${formData.carrier} / 직업: ${formData.employmentType}`,
        source: "홈페이지",
      });
      setComplete(true);
    }
  };

  const handleStep3Submit = () => {
    // 2차 전송: 전체 정보 백그라운드 전송
    sendToSystem({
      name: formData.name.trim(),
      phone: formData.phone.replace(/-/g, ""),
      content: `통신사: ${formData.carrier} / 직업: ${formData.employmentType} / 4대보험: ${formData.has4Insurance}`,
      source: "홈페이지",
    });
    setComplete(true);
  };

  if (complete) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="text-center">
            <Link href="/" className="text-sm font-bold text-navy">
              (주)데일리에프앤아이대부 2024-금감원-2626(대부중개업)
            </Link>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center px-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">접수 완료!</h1>
            <p className="text-gray-500 mb-6">곧 상담 연락을 드리겠습니다.</p>
            <Link
              href="/"
              className="inline-flex items-center px-6 py-3 bg-accent hover:bg-accent-hover text-white font-semibold rounded-lg transition-colors"
            >
              홈으로 돌아가기
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 미니멀 헤더 */}
      <header className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="text-center">
          <Link href="/" className="text-sm font-bold text-navy">
            (주)데일리에프앤아이대부 2024-금감원-2626(대부중개업)
          </Link>
        </div>
      </header>

      {/* 프로그레스 바 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
            <span>Step {step}/3</span>
            <span>{Math.round((step / 3) * 100)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-accent h-2 rounded-full transition-all duration-500"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* 폼 */}
      <main className="flex-1 px-4 py-8">
        <div className="max-w-md mx-auto">
          {/* Step 1: 기본 정보 */}
          {step === 1 && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-1">무료 상담 신청</h1>
              <p className="text-gray-500 text-sm mb-6">기본 정보를 입력해 주세요.</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    placeholder="홍길동"
                    className={`w-full px-4 py-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 ${
                      errors.name ? "border-error bg-error/5" : "border-gray-300"
                    }`}
                  />
                  {errors.name && <p className="mt-1 text-xs text-error">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">통신사</label>
                  <select
                    value={formData.carrier}
                    onChange={(e) => updateField("carrier", e.target.value)}
                    className={`w-full px-4 py-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 appearance-none bg-white ${
                      errors.carrier ? "border-error bg-error/5" : "border-gray-300"
                    }`}
                  >
                    <option value="">선택해 주세요</option>
                    {CARRIERS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  {errors.carrier && <p className="mt-1 text-xs text-error">{errors.carrier}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => updateField("phone", formatPhone(e.target.value))}
                    placeholder="010-1234-5678"
                    className={`w-full px-4 py-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 ${
                      errors.phone ? "border-error bg-error/5" : "border-gray-300"
                    }`}
                  />
                  {errors.phone && <p className="mt-1 text-xs text-error">{errors.phone}</p>}
                </div>

                <div
                  className={`p-4 rounded-lg border transition-all ${
                    consentWarning
                      ? "border-error bg-error/5 animate-[shake_0.3s_ease]"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.consent}
                      onChange={(e) => updateField("consent", e.target.checked)}
                      className="mt-0.5 w-5 h-5 rounded border-gray-300 text-accent focus:ring-accent"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-700">
                        개인정보 이용 및 취득에 동의합니다.
                      </span>
                      <p className="text-xs text-gray-400 mt-1">
                        입력하신 정보(이름, 통신사, 전화번호)는 대출 상담 목적으로만 사용되며, 동의 없이는 어떠한 정보도 저장·전송되지 않습니다.
                      </p>
                    </div>
                  </label>
                  {consentWarning && (
                    <p className="mt-2 text-xs text-error font-medium">
                      ⚠ 개인정보 이용 및 취득에 동의해 주셔야 접수가 가능합니다.
                    </p>
                  )}
                </div>

                <button
                  onClick={handleStep1Submit}
                  disabled={submitting}
                  className="w-full py-3.5 bg-accent hover:bg-accent-hover disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                >
                  {submitting ? "접수 중..." : "등록"}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: 직업 유형 */}
          {step === 2 && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-1">추가 정보</h1>
              <p className="text-gray-500 text-sm mb-6">더 정확한 상담을 위해 알려주세요.</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">직업 유형</label>
                  <select
                    value={formData.employmentType}
                    onChange={(e) => updateField("employmentType", e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 appearance-none bg-white"
                  >
                    <option value="">선택해 주세요</option>
                    <option value="employed">직장인</option>
                    <option value="self_employed">개인사업자</option>
                    <option value="unemployed">무직</option>
                    <option value="other">기타</option>
                  </select>
                </div>

                <button
                  onClick={handleStep2Submit}
                  disabled={!formData.employmentType}
                  className="w-full py-3.5 bg-accent hover:bg-accent-hover disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
                >
                  다음
                </button>
              </div>
            </div>
          )}

          {/* Step 3: 4대보험 (직장인만) */}
          {step === 3 && (
            <div>
              <h1 className="text-xl font-bold text-gray-900 mb-1">상세 정보</h1>
              <p className="text-gray-500 text-sm mb-6">마지막 단계입니다.</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    4대 보험 가입 여부
                  </label>
                  <select
                    value={formData.has4Insurance}
                    onChange={(e) => updateField("has4Insurance", e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/50 appearance-none bg-white"
                  >
                    <option value="">선택해 주세요</option>
                    <option value="yes">가입</option>
                    <option value="no">미가입</option>
                    <option value="unknown">모름</option>
                  </select>
                </div>

                <button
                  onClick={handleStep3Submit}
                  className="w-full py-3.5 bg-accent hover:bg-accent-hover text-white font-semibold rounded-lg transition-colors"
                >
                  완료
                </button>
              </div>
            </div>
          )}

          {/* 법적 고지 요약 */}
          <div className="mt-8 p-3 bg-gray-100 rounded-lg">
            <p className="text-[10px] text-gray-400 leading-relaxed whitespace-pre-line">
              {COMMON_LEGAL_NOTICE}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
