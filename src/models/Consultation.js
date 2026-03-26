const { v4: uuidv4 } = require('uuid');

// 인메모리 상담 저장소
const consultations = new Map();

// 유효 채널값
const VALID_CHANNELS = ['전화', '방문', '카카오톡', '문자'];

class Consultation {
  constructor({ customerId, channel, content, nextActionDate, nextActionContent, consultedBy }) {
    this.id = uuidv4();
    this.customerId = customerId;
    this.channel = channel;
    this.content = content || '';
    this.nextActionDate = nextActionDate || null;
    this.nextActionContent = nextActionContent || '';
    this.consultedBy = consultedBy || null;
    this.consultedAt = new Date().toISOString();
  }

  toJSON() {
    return {
      id: this.id,
      customerId: this.customerId,
      channel: this.channel,
      content: this.content,
      nextActionDate: this.nextActionDate,
      nextActionContent: this.nextActionContent,
      consultedBy: this.consultedBy,
      consultedAt: this.consultedAt,
    };
  }
}

// --- 저장소 함수들 ---

function create(data) {
  if (!data.customerId) {
    throw new Error('고객 ID는 필수 항목입니다.');
  }
  if (!data.channel || !VALID_CHANNELS.includes(data.channel)) {
    throw new Error(`유효하지 않은 채널입니다. 가능한 값: ${VALID_CHANNELS.join(', ')}`);
  }

  const consultation = new Consultation(data);
  consultations.set(consultation.id, consultation);
  return consultation;
}

function findByCustomerId(customerId) {
  const results = [];
  for (const c of consultations.values()) {
    if (c.customerId === customerId) {
      results.push(c);
    }
  }
  // 최신순 정렬
  results.sort((a, b) => (a.consultedAt > b.consultedAt ? -1 : 1));
  return results;
}

function findById(id) {
  return consultations.get(id) || null;
}

function findAll() {
  return Array.from(consultations.values());
}

function update(id, updates) {
  const consultation = consultations.get(id);
  if (!consultation) return null;

  const allowed = ['channel', 'content', 'nextActionDate', 'nextActionContent', 'consultedBy'];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      if (key === 'channel' && !VALID_CHANNELS.includes(updates[key])) {
        throw new Error(`유효하지 않은 채널입니다. 가능한 값: ${VALID_CHANNELS.join(', ')}`);
      }
      consultation[key] = updates[key];
    }
  }
  return consultation;
}

function remove(id) {
  const consultation = consultations.get(id);
  if (!consultation) return false;
  consultations.delete(id);
  return true;
}

/**
 * 특정 고객의 상담 기록을 다른 고객으로 이관 (병합 시 사용)
 */
function transferConsultations(fromCustomerId, toCustomerId) {
  for (const c of consultations.values()) {
    if (c.customerId === fromCustomerId) {
      c.customerId = toCustomerId;
    }
  }
}

module.exports = {
  Consultation,
  VALID_CHANNELS,
  create,
  findByCustomerId,
  findById,
  findAll,
  update,
  remove,
  transferConsultations,
};
