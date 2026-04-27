const Tool = require('../core/Tool');

/**
 * 개인정보 동의 게이트 도구
 *
 * 역할:
 * 1. 동의 체크 여부 검증
 * 2. 필수 입력 항목 검증 (이름, 통신사, 전화번호)
 * 3. 전송 가능 여부 판단
 * 4. 동의 미체크 시 경고 메시지 생성
 */
class ConsentGateTool extends Tool {
  constructor() {
    super({
      name: 'consent_gate',
      description: '고객 신청 시 개인정보 동의 체크 및 필수 입력 항목을 검증합니다.',
      parameters: {
        formData: { type: 'object', description: '신청 폼 데이터 (name, carrier, phone, consent)' },
        action: { type: 'string', description: '실행 액션 (validate, getRequirements)', default: 'validate' },
      },
    });

    this.requiredFields = [
      { field: 'name', label: '이름', validator: (v) => v && v.trim().length >= 2, errorMsg: '이름을 2자 이상 입력해 주세요.' },
      { field: 'carrier', label: '통신사', validator: (v) => v && v.trim().length > 0, errorMsg: '통신사를 선택해 주세요.' },
      { field: 'phone', label: '전화번호', validator: (v) => v && /^01[016789]-?\d{3,4}-?\d{4}$/.test(v.replace(/-/g, '')), errorMsg: '올바른 전화번호를 입력해 주세요.' },
    ];

    this.validCarriers = ['SKT', 'KT', 'LGU', 'SKT_MVNO', 'KT_MVNO', 'LGU_MVNO'];
  }

  async execute(input) {
    const { formData = {}, action = 'validate' } = input;

    switch (action) {
      case 'validate':
        return this._validate(formData);
      case 'getRequirements':
        return this._getRequirements();
      default:
        return { status: 'error', message: `알 수 없는 액션: ${action}` };
    }
  }

  _validate(formData) {
    const errors = [];
    const warnings = [];

    // 1. 필수 항목 검증
    this.requiredFields.forEach(req => {
      const value = formData[req.field];
      if (!req.validator(value)) {
        errors.push({
          field: req.field,
          label: req.label,
          message: req.errorMsg,
        });
      }
    });

    // 2. 통신사 유효성 추가 검증
    if (formData.carrier && !this.validCarriers.includes(formData.carrier)) {
      errors.push({
        field: 'carrier',
        label: '통신사',
        message: '올바른 통신사를 선택해 주세요.',
      });
    }

    // 3. 동의 체크 검증 (핵심!)
    const consentChecked = formData.consent === true;
    if (!consentChecked) {
      errors.push({
        field: 'consent',
        label: '개인정보 이용 및 취득 동의',
        message: '개인정보 이용 및 취득에 동의해 주셔야 접수가 가능합니다.',
        isConsentError: true,
      });
    }

    // 4. 전송 가능 여부
    const canSubmit = errors.length === 0;
    const hasConsentError = errors.some(e => e.isConsentError);
    const hasFieldError = errors.some(e => !e.isConsentError);

    return {
      status: canSubmit ? 'pass' : 'fail',
      canSubmit,
      hasConsentError,
      hasFieldError,
      errors,
      warnings,
      // 동의 미체크 시 특별 경고 메시지
      consentWarning: hasConsentError
        ? {
            title: '개인정보 동의 필요',
            message: '개인정보 이용 및 취득에 동의해 주셔야 접수가 가능합니다.',
            action: '동의 체크박스를 체크한 후 다시 등록 버튼을 눌러주세요.',
            highlight: 'consent', // 하이라이트할 필드
          }
        : null,
      validatedData: canSubmit
        ? {
            name: formData.name.trim(),
            carrier: formData.carrier,
            phone: formData.phone.replace(/-/g, ''),
            consent: true,
          }
        : null,
    };
  }

  _getRequirements() {
    return {
      status: 'success',
      requiredFields: this.requiredFields.map(f => ({
        field: f.field,
        label: f.label,
      })),
      consentRequired: true,
      consentText: '개인정보 이용 및 취득에 동의합니다.',
      consentDetail: '입력하신 정보(이름, 통신사, 전화번호)는 대출 상담 목적으로만 사용되며, 동의 없이는 어떠한 정보도 저장·전송되지 않습니다.',
      validCarriers: this.validCarriers,
    };
  }
}

module.exports = ConsentGateTool;
