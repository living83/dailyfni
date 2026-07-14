require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, testConnection } = require('./db');

async function seed() {
  const connected = await testConnection();
  if (!connected) { process.exit(1); }

  // 기존 직원 확인
  const existing = await query('SELECT COUNT(*) as cnt FROM employees');
  if (existing[0].cnt > 0) {
    console.log('직원 데이터가 이미 존재합니다. 건너뜁니다.');
    process.exit(0);
  }

  const employees = [
    { loginId: 'admin', name: '박팀장', dept: '관리부', pos: '팀장', role: 'admin', scope: 'all', date: '2020-03-01', pw: '1234' },
    { loginId: 'kim', name: '김대리', dept: '영업부', pos: '대리', role: 'sales', scope: 'self', date: '2021-06-15', pw: '1234' },
    { loginId: 'lee', name: '이과장', dept: '영업부', pos: '과장', role: 'sales', scope: 'self', date: '2019-11-01', pw: '1234' },
    { loginId: 'park', name: '박사원', dept: '영업부', pos: '사원', role: 'sales', scope: 'self', date: '2023-01-10', pw: '1234' },
  ];

  for (const e of employees) {
    const hash = await bcrypt.hash(e.pw, 12);
    await query(
      'INSERT INTO employees (login_id, name, department, position_title, role, data_scope, password_hash, join_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [e.loginId, e.name, e.dept, e.pos, e.role, e.scope, hash, e.date]
    );
    console.log(`직원 생성: ${e.name} (${e.loginId})`);
  }

  console.log('\n초기 데이터 생성 완료!');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
