/**
 * DailyFNI Agency System - 데모 스크립트
 * 사용법: npm run demo
 */

const Agent = require('./core/Agent');
const Task = require('./core/Task');
const Agency = require('./core/Agency');
const CalculatorTool = require('./tools/CalculatorTool');
const TextTool = require('./tools/TextTool');
const DateTimeTool = require('./tools/DateTimeTool');

async function main() {
  console.log('=== DailyFNI Agency 데모 ===\n');

  // 1. 도구 생성
  const calcTool = new CalculatorTool();
  const textTool = new TextTool();
  const dateTool = new DateTimeTool();

  // 2. 에이전트 생성
  const researcher = new Agent({
    name: '리서처',
    role: '정보 분석가',
    goal: '데이터를 분석하고 핵심 인사이트를 도출합니다.',
    backstory: '10년 경력의 데이터 분석 전문가',
    tools: [textTool, dateTool],
  });

  const writer = new Agent({
    name: '라이터',
    role: '콘텐츠 작성자',
    goal: '분석 결과를 읽기 쉬운 보고서로 작성합니다.',
    backstory: '전문 기술 블로거 출신의 콘텐츠 전문가',
    tools: [textTool],
  });

  const calculator = new Agent({
    name: '계산기',
    role: '수치 분석가',
    goal: '정확한 수치 계산과 통계 분석을 수행합니다.',
    tools: [calcTool],
  });

  // 3. 태스크 생성
  const task1 = new Task({
    description: '2024년 AI 트렌드 키워드를 분석하세요.',
    expectedOutput: '상위 5개 키워드와 빈도 분석',
    agent: researcher,
    priority: 'high',
  });

  const task2 = new Task({
    description: '분석 결과를 바탕으로 요약 보고서를 작성하세요.',
    expectedOutput: '300자 이내의 요약문',
    agent: writer,
  });

  const task3 = new Task({
    description: '관련 수치 데이터를 계산하세요.',
    agent: calculator,
  });

  // 4. 에이전시 생성 및 실행
  const agency = new Agency({
    name: 'AI 분석 에이전시',
    description: 'AI 트렌드를 분석하고 보고서를 작성하는 에이전시',
    strategy: 'sequential',
  });

  agency.addAgent(researcher);
  agency.addAgent(writer);
  agency.addAgent(calculator);
  agency.addTask(task1);
  agency.addTask(task2);
  agency.addTask(task3);

  // 이벤트 리스너
  agency.on('task:start', (task) => console.log(`▶ 태스크 시작: ${task.description}`));
  agency.on('task:complete', (task) => console.log(`✓ 태스크 완료: ${task.description}\n`));

  console.log(`에이전시: ${agency.name}`);
  console.log(`전략: ${agency.strategy}`);
  console.log(`에이전트: ${agency.agents.length}명`);
  console.log(`태스크: ${agency.tasks.length}개\n`);

  const results = await agency.run();

  console.log('\n=== 실행 결과 ===');
  results.forEach((r, i) => {
    console.log(`\n[${i + 1}] ${r.description}`);
    console.log(`   상태: ${r.status}`);
    console.log(`   담당: ${r.agentName}`);
    if (r.result?.output) console.log(`   결과: ${r.result.output}`);
  });

  console.log('\n=== 데모 완료 ===');
}

main().catch(console.error);
