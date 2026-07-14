-- ========================================
-- 대부중개 전산시스템 - MySQL 데이터베이스 스키마
-- ========================================

CREATE DATABASE IF NOT EXISTS dailyfni DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dailyfni;

-- ========================================
-- 1. 직원 (employees)
-- ========================================
CREATE TABLE employees (
  id INT AUTO_INCREMENT PRIMARY KEY,
  login_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(50) NOT NULL,
  department VARCHAR(50) DEFAULT '',
  position VARCHAR(50) DEFAULT '',
  role ENUM('admin', 'sales') DEFAULT 'sales',
  data_scope ENUM('self', 'all') DEFAULT 'self',
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  join_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ========================================
-- 2. 고객 (customers)
-- ========================================
CREATE TABLE customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  ssn VARCHAR(20) DEFAULT '',
  age INT DEFAULT 0,
  phone VARCHAR(20) NOT NULL,
  phone2 VARCHAR(20) DEFAULT '',
  email VARCHAR(100) DEFAULT '',
  address TEXT DEFAULT '',
  residence_address TEXT DEFAULT '',
  company VARCHAR(100) DEFAULT '',
  company_addr TEXT DEFAULT '',
  company_phone VARCHAR(20) DEFAULT '',
  salary INT DEFAULT 0,
  employment_type VARCHAR(20) DEFAULT '',
  work_years VARCHAR(20) DEFAULT '',
  court_name VARCHAR(50) DEFAULT '',
  case_no VARCHAR(50) DEFAULT '',
  refund_bank VARCHAR(50) DEFAULT '',
  refund_account VARCHAR(50) DEFAULT '',
  refund_holder VARCHAR(50) DEFAULT '',
  credit_score INT DEFAULT 0,
  credit_status ENUM('정상', '회생', '파산', '회복') DEFAULT '정상',
  total_debt VARCHAR(50) DEFAULT '0',
  existing_loans TEXT DEFAULT '',
  db_source VARCHAR(50) DEFAULT '',
  assigned_to VARCHAR(50) DEFAULT '',
  assigned_employee_id INT,
  status ENUM('리드', '상담', '접수', '심사중', '승인', '부결', '실행', '환수', '종결') DEFAULT '리드',
  memo TEXT DEFAULT '',
  tags JSON,
  reg_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (assigned_employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  INDEX idx_phone (phone),
  INDEX idx_name (name),
  INDEX idx_status (status),
  INDEX idx_assigned (assigned_employee_id)
);

-- ========================================
-- 3. 상담 이력 (consultations)
-- ========================================
CREATE TABLE consultations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  channel ENUM('전화', '방문', '카카오톡', '문자', '메모') DEFAULT '메모',
  content TEXT NOT NULL,
  next_action_date DATE,
  next_action_content VARCHAR(255) DEFAULT '',
  consulted_by VARCHAR(50) DEFAULT '',
  consulted_by_id INT,
  consulted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (consulted_by_id) REFERENCES employees(id) ON DELETE SET NULL,
  INDEX idx_customer (customer_id),
  INDEX idx_date (consulted_at)
);

-- ========================================
-- 4. 대출 신청 (loan_applications)
-- ========================================
CREATE TABLE loan_applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  customer_name VARCHAR(50) DEFAULT '',
  loan_amount INT DEFAULT 0,
  loan_type VARCHAR(50) DEFAULT '',
  product_name VARCHAR(100) DEFAULT '',
  fee_rate DECIMAL(5,2) DEFAULT 0,
  fee_amount DECIMAL(10,2) DEFAULT 0,
  agency_name VARCHAR(100) DEFAULT '',
  db_source VARCHAR(50) DEFAULT '',
  status VARCHAR(30) DEFAULT '접수',
  assigned_to VARCHAR(50) DEFAULT '',
  assigned_employee_id INT,
  team_id VARCHAR(50) DEFAULT '',
  memo TEXT DEFAULT '',
  tags JSON,
  documents JSON,
  loan_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  INDEX idx_customer (customer_id),
  INDEX idx_status (status),
  INDEX idx_date (created_at)
);

-- ========================================
-- 5. 상태 변경 이력 (status_history)
-- ========================================
CREATE TABLE status_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  target_type ENUM('customer', 'loan') NOT NULL,
  target_id INT NOT NULL,
  before_status VARCHAR(30) DEFAULT '',
  after_status VARCHAR(30) DEFAULT '',
  reason VARCHAR(255) DEFAULT '',
  changed_by VARCHAR(50) DEFAULT '',
  changed_by_id INT,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (changed_by_id) REFERENCES employees(id) ON DELETE SET NULL,
  INDEX idx_target (target_type, target_id)
);

-- ========================================
-- 6. 정산 - 실행 건 (settlement_executions)
-- ========================================
CREATE TABLE settlement_executions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  loan_application_id INT,
  customer_name VARCHAR(50) DEFAULT '',
  executed_date DATE NOT NULL,
  loan_amount INT DEFAULT 0,
  product_name VARCHAR(100) DEFAULT '',
  fee_rate_under DECIMAL(5,2) DEFAULT 0,
  fee_rate_over DECIMAL(5,2) DEFAULT 0,
  fee_amount DECIMAL(10,2) DEFAULT 0,
  db_source VARCHAR(50) DEFAULT '',
  assigned_to VARCHAR(50) DEFAULT '',
  assigned_employee_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (loan_application_id) REFERENCES loan_applications(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  INDEX idx_date (executed_date),
  INDEX idx_month (executed_date)
);

-- ========================================
-- 7. 정산 - 리베이트/환수 (settlement_adjustments)
-- ========================================
CREATE TABLE settlement_adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type ENUM('리베이트', '환수') NOT NULL,
  amount DECIMAL(10,2) DEFAULT 0,
  reason VARCHAR(255) DEFAULT '',
  target_month VARCHAR(7) DEFAULT '',
  related_execution_id INT,
  manager VARCHAR(50) DEFAULT '',
  created_by_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (related_execution_id) REFERENCES settlement_executions(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_id) REFERENCES employees(id) ON DELETE SET NULL
);

-- ========================================
-- 8. 정산 - 월 마감 (monthly_closes)
-- ========================================
CREATE TABLE monthly_closes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  target_month VARCHAR(7) NOT NULL UNIQUE,
  is_closed BOOLEAN DEFAULT FALSE,
  closed_by VARCHAR(50) DEFAULT '',
  closed_by_id INT,
  closed_at TIMESTAMP NULL,
  reopened_by VARCHAR(50) DEFAULT '',
  reopen_reason VARCHAR(255) DEFAULT '',
  execution_count INT DEFAULT 0,
  total_sales INT DEFAULT 0,
  FOREIGN KEY (closed_by_id) REFERENCES employees(id) ON DELETE SET NULL
);

-- ========================================
-- 9. 알림 (notifications)
-- ========================================
CREATE TABLE notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type ENUM('reminder', 'stagnant', 'document', 'system') DEFAULT 'system',
  title VARCHAR(255) NOT NULL,
  content TEXT DEFAULT '',
  target_user_id INT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  related_entity_type VARCHAR(30) DEFAULT '',
  related_entity_id INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (target_user_id) REFERENCES employees(id) ON DELETE CASCADE,
  INDEX idx_user_read (target_user_id, is_read)
);

-- ========================================
-- 10. 감사로그 (audit_logs)
-- ========================================
CREATE TABLE audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_type ENUM('status_change', 'assignee_change', 'settlement_change', 'close_month', 'customer_edit', 'login') NOT NULL,
  target_type VARCHAR(30) DEFAULT '',
  target_id INT DEFAULT 0,
  target_name VARCHAR(100) DEFAULT '',
  before_value TEXT DEFAULT '',
  after_value TEXT DEFAULT '',
  reason VARCHAR(255) DEFAULT '',
  performed_by VARCHAR(50) DEFAULT '',
  performed_by_id INT,
  performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (performed_by_id) REFERENCES employees(id) ON DELETE SET NULL,
  INDEX idx_date (performed_at),
  INDEX idx_type (event_type)
);

-- ========================================
-- 초기 데이터 - 관리자 계정
-- ========================================
-- 비밀번호는 Node.js에서 bcrypt로 해시화하여 INSERT
-- 초기 세팅은 서버 시작 시 seed 스크립트로 실행
