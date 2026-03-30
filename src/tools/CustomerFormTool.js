const Tool = require('../core/Tool');

/**
 * 점진적 고객 정보 수집 도구
 *
 * 역할:
 * 1. 단계별 폼 필드 정의 및 관리
 * 2. 현재 단계 기반으로 다음 단계 결정
 * 3. 각 단계별 입력 데이터 취합
 * 4. 전산 전송용 데이터(필수/선택) 분류
 */
class CustomerFormTool extends Tool {
  constructor() {
    super({
      name: 'customer_form',
      description: '점진적 고객 정보 수집 단계를 관리하고, 단계별 폼 필드를 제공합니다.',
      parameters: {
        action: { type: 'string', description: '실행 액션 (getStep, processStep, getSummary)', default: 'getStep' },
        currentStep: { type: 'number', description: '현재 단계 (1, 2, 3)', default: 1 },
        formData: { type: 'object', description: '현재까지 수집된 폼 데이터', default: {} },
      },
    });

    // 단계 정의
    this.steps = [
      {
        step: 1,
        title: '기본 정보',
        description: '상담에 필요한 기본 정보를 입력해 주세요.',
        fields: [
          { name: 'name', label: '이름', type: 'text', placeholder: '홍길동', required: true, transmissionType: 'primary' },
          { name: 'carrier', label: '통신사', type: 'select', options: ['SKT', 'KT', 'LGU', 'SKT_MVNO', 'KT_MVNO', 'LGU_MVNO'], required: true, transmissionType: 'primary' },
          { name: 'phone', label: '전화번호', type: 'tel', placeholder: '01012345678', required: true, transmissionType: 'primary' },
        ],
        requiresConsent: true,
        submitLabel: '등록',
        isTransmissionPoint: true, // 1차 전송 시점
      },
      {
        step: 2,
        title: '추가 정보',
        description: '더 정확한 상담을 위해 추가 정보를 알려주세요.',
        fields: [
          {
            name: 'employmentType',
            label: '직업 유형',
            type: 'select',
            options: [
              { value: 'employed', label: '직장인' },
              { value: 'self_employed', label: '개인사업자' },
              { value: 'unemployed', label: '무직' },
              { value: 'other', label: '기타' },
            ],
            required: false,
            transmissionType: 'secondary',
          },
        ],
        requiresConsent: false,
        submitLabel: '다음',
        isTransmissionPoint: false,
      },
      {
        step: 3,
        title: '상세 정보',
        description: '마지막 단계입니다.',
        fields: [
          {
            name: 'has4Insurance',
            label: '4대 보험 가입 여부',
            type: 'select',
            options: [
              { value: 'yes', label: '가입' },
              { value: 'no', label: '미가입' },
              { value: 'unknown', label: '모름' },
            ],
            required: false,
            transmissionType: 'secondary',
            showCondition: { field: 'employmentType', value: 'employed' },
          },
        ],
        requiresConsent: false,
        submitLabel: '완료',
        isTransmissionPoint: true, // 2차 전송 시점
      },
    ];
  }

  async execute(input) {
    const { action = 'getStep', currentStep = 1, formData = {} } = input;

    switch (action) {
      case 'getStep':
        return this._getStep(currentStep, formData);
      case 'processStep':
        return this._processStep(currentStep, formData);
      case 'getSummary':
        return this._getSummary(formData);
      default:
        return { status: 'error', message: `알 수 없는 액션: ${action}` };
    }
  }

  _getStep(stepNumber, formData) {
    const step = this.steps.find(s => s.step === stepNumber);
    if (!step) {
      return { status: 'error', message: `존재하지 않는 단계: ${stepNumber}` };
    }

    // 조건부 필드 필터링
    const visibleFields = step.fields.filter(field => {
      if (!field.showCondition) return true;
      const { field: condField, value: condValue } = field.showCondition;
      return formData[condField] === condValue;
    });

    return {
      status: 'success',
      step: step.step,
      title: step.title,
      description: step.description,
      fields: visibleFields,
      requiresConsent: step.requiresConsent,
      submitLabel: step.submitLabel,
      isTransmissionPoint: step.isTransmissionPoint,
      totalSteps: this.steps.length,
      progress: Math.round((stepNumber / this.steps.length) * 100),
    };
  }

  _processStep(stepNumber, formData) {
    const step = this.steps.find(s => s.step === stepNumber);
    if (!step) {
      return { status: 'error', message: `존재하지 않는 단계: ${stepNumber}` };
    }

    // 필수 필드 검증
    const visibleFields = step.fields.filter(field => {
      if (!field.showCondition) return true;
      const { field: condField, value: condValue } = field.showCondition;
      return formData[condField] === condValue;
    });

    const missingRequired = visibleFields
      .filter(f => f.required && (!formData[f.name] || formData[f.name].toString().trim() === ''))
      .map(f => ({ field: f.name, label: f.label }));

    if (missingRequired.length > 0) {
      return {
        status: 'fail',
        message: '필수 항목을 입력해 주세요.',
        missingFields: missingRequired,
      };
    }

    // 다음 단계 결정
    const nextStep = stepNumber < this.steps.length ? stepNumber + 1 : null;
    const isComplete = nextStep === null;

    // 전송 데이터 분류
    const transmissionData = this._classifyTransmissionData(formData);

    return {
      status: 'success',
      currentStep: stepNumber,
      nextStep,
      isComplete,
      isTransmissionPoint: step.isTransmissionPoint,
      transmissionData: step.isTransmissionPoint ? transmissionData : null,
      formData,
    };
  }

  _getSummary(formData) {
    const transmissionData = this._classifyTransmissionData(formData);

    return {
      status: 'success',
      formData,
      transmissionData,
      allSteps: this.steps.map(s => ({
        step: s.step,
        title: s.title,
        isTransmissionPoint: s.isTransmissionPoint,
        fields: s.fields.map(f => f.name),
      })),
    };
  }

  _classifyTransmissionData(formData) {
    const primary = {}; // 1차 전송 (필수)
    const secondary = {}; // 2차 전송 (선택)

    this.steps.forEach(step => {
      step.fields.forEach(field => {
        const value = formData[field.name];
        if (value !== undefined && value !== null && value !== '') {
          if (field.transmissionType === 'primary') {
            primary[field.name] = value;
          } else {
            secondary[field.name] = value;
          }
        }
      });
    });

    return { primary, secondary };
  }
}

module.exports = CustomerFormTool;
