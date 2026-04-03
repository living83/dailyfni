/**
 * Settings 모델 — 인메모리 저장
 * 단일 설정 객체 (시스템 전역)
 */

const defaultSettings = {
  // API Keys
  claudeApiKey: '',
  naverClientId: '',
  naverClientSecret: '',

  // Engagement bot
  engagementBot: false,
  engStartHour: '09',
  engStartMin: '00',
  maxVisits: 20,
  heartLike: true,
  aiComment: true,
  engagementAccountIds: [],

  // System
  logLevel: '정보',
  logRetention: '30일',
  proxyAutoCheck: true,
  proxyCheckInterval: '6시간',

  updatedAt: new Date().toISOString(),
};

let settings = { ...defaultSettings };

function getSettings() {
  // API 키는 마스킹해서 반환
  return {
    ...settings,
    claudeApiKey: settings.claudeApiKey ? '••••••' + settings.claudeApiKey.slice(-8) : '',
    naverClientSecret: settings.naverClientSecret ? '••••••' + settings.naverClientSecret.slice(-4) : '',
  };
}

function getSettingsRaw() {
  return { ...settings };
}

function updateSettings(data) {
  // 빈 문자열이 아닌 경우에만 API 키 업데이트 (마스킹된 값 무시)
  if (data.claudeApiKey && !data.claudeApiKey.startsWith('••')) {
    settings.claudeApiKey = data.claudeApiKey;
  }
  if (data.naverClientSecret && !data.naverClientSecret.startsWith('••')) {
    settings.naverClientSecret = data.naverClientSecret;
  }
  if (data.naverClientId !== undefined) settings.naverClientId = data.naverClientId;

  // Boolean / string / number fields
  const boolFields = ['engagementBot', 'heartLike', 'aiComment', 'proxyAutoCheck'];
  const strFields = ['engStartHour', 'engStartMin', 'logLevel', 'logRetention', 'proxyCheckInterval'];
  const numFields = ['maxVisits'];
  const arrFields = ['engagementAccountIds'];

  for (const k of boolFields) if (data[k] !== undefined) settings[k] = !!data[k];
  for (const k of strFields) if (data[k] !== undefined) settings[k] = String(data[k]);
  for (const k of numFields) if (data[k] !== undefined) settings[k] = Number(data[k]);
  for (const k of arrFields) if (Array.isArray(data[k])) settings[k] = data[k];

  settings.updatedAt = new Date().toISOString();
  return getSettings();
}

function backupSettings() {
  return JSON.parse(JSON.stringify(settings));
}

function restoreSettings(data) {
  settings = { ...defaultSettings, ...data, updatedAt: new Date().toISOString() };
  return getSettings();
}

module.exports = { getSettings, getSettingsRaw, updateSettings, backupSettings, restoreSettings };
