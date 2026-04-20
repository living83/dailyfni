const mysql = require('mysql2/promise');

let pool = null;
let hubPool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'dailyfni',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
  }
  return pool;
}

// hub_client DB 커넥션 풀 (LGU+ msghub-agent 와 공유하는 UMS 발송 테이블)
function getHubPool() {
  if (!hubPool) {
    hubPool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.HUB_DB_USER || 'msghub',
      password: process.env.HUB_DB_PASSWORD || '',
      database: process.env.HUB_DB_NAME || 'hub_client',
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0
    });
  }
  return hubPool;
}

async function query(sql, params) {
  const pool = getPool();
  const [rows] = await pool.execute(sql, params);
  return rows;
}

// hub_client DB 쿼리
async function hubQuery(sql, params) {
  const pool = getHubPool();
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function testConnection() {
  try {
    const pool = getPool();
    const conn = await pool.getConnection();
    console.log('MySQL 연결 성공');
    conn.release();
    return true;
  } catch (err) {
    console.error('MySQL 연결 실패:', err.message);
    return false;
  }
}

module.exports = { getPool, getHubPool, query, hubQuery, testConnection };
