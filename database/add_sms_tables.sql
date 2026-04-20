-- SMS 발송 시스템 테이블
-- hub_client DB 의 UMS_MSG 는 LGU+ 에이전트가 관리하므로 건드리지 않음.
-- dailyfni DB 에 발송 이력/템플릿/배치 관리 테이블을 생성.

-- 1) 개별 발송 로그 (단건 + 일괄 공용)
CREATE TABLE IF NOT EXISTS sms_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  batch_id INT DEFAULT NULL COMMENT '일괄이면 sms_batches.id, 단건이면 NULL',
  customer_id INT DEFAULT NULL COMMENT 'customers.id FK',
  customer_name VARCHAR(50) DEFAULT '' COMMENT '고객 이름',
  phone VARCHAR(20) NOT NULL COMMENT '수신번호',
  msg_type ENUM('SMS','LMS','MMS') DEFAULT 'SMS',
  content TEXT COMMENT '실제 발송된 메시지 내용',
  template_id INT DEFAULT NULL COMMENT 'sms_templates.id',
  template_name VARCHAR(100) DEFAULT NULL COMMENT '템플릿 이름 (조회용)',
  template_code VARCHAR(20) DEFAULT NULL COMMENT 'LGU+ TEMPLATE_CODE',
  client_key VARCHAR(40) DEFAULT NULL COMMENT 'UMS_MSG.CLIENT_KEY (UUID)',
  sent_by VARCHAR(50) DEFAULT '' COMMENT '발송자 (로그인 사용자)',
  status ENUM('pending','sent','done','failed') DEFAULT 'pending',
  done_code VARCHAR(10) DEFAULT NULL COMMENT 'LGU+ 결과코드 (10000=성공)',
  done_desc VARCHAR(200) DEFAULT NULL COMMENT '결과 설명',
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  done_at DATETIME DEFAULT NULL COMMENT '결과 수신 시각',
  INDEX idx_customer (customer_id),
  INDEX idx_batch (batch_id),
  INDEX idx_client_key (client_key),
  INDEX idx_sent_at (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2) 일괄 발송 배치 (현황관리 발송이력용)
CREATE TABLE IF NOT EXISTS sms_batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  template_name VARCHAR(100) DEFAULT NULL,
  template_code VARCHAR(20) DEFAULT NULL,
  content TEXT COMMENT '발송 메시지 내용 (치환 전)',
  msg_type ENUM('SMS','LMS','MMS') DEFAULT 'SMS',
  total_count INT DEFAULT 0,
  success_count INT DEFAULT 0,
  fail_count INT DEFAULT 0,
  sent_by VARCHAR(50) DEFAULT '',
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sent_at (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3) 문자 템플릿 (자주 쓰는 문구)
CREATE TABLE IF NOT EXISTS sms_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL COMMENT '표시 이름 (예: 부재중 안내)',
  category VARCHAR(50) DEFAULT '상담' COMMENT '상담/안내/마케팅',
  template_code VARCHAR(20) NOT NULL COMMENT 'LGU+ 메시지허브 TEMPLATE_CODE',
  content TEXT COMMENT '메시지 본문 미리보기 (변수 포함)',
  msg_type ENUM('SMS','LMS') DEFAULT 'SMS',
  variables TEXT DEFAULT NULL COMMENT 'JSON — 사용된 변수 목록 예: ["고객","상품"]',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4) 고객 수신동의 컬럼 (customers 테이블에 추가)
-- ADD COLUMN IF NOT EXISTS 대신 프로시저 사용 (MySQL 5.7 호환)
DROP PROCEDURE IF EXISTS add_sms_consent_cols;
DELIMITER //
CREATE PROCEDURE add_sms_consent_cols()
BEGIN
  DECLARE col_count INT;
  SELECT COUNT(*) INTO col_count FROM INFORMATION_SCHEMA.COLUMNS
    WHERE table_schema = DATABASE() AND table_name = 'customers' AND column_name = 'sms_consent';
  IF col_count = 0 THEN
    ALTER TABLE customers ADD COLUMN sms_consent BOOLEAN DEFAULT FALSE;
    ALTER TABLE customers ADD COLUMN sms_consent_at DATETIME DEFAULT NULL;
  END IF;
END //
DELIMITER ;
CALL add_sms_consent_cols();
DROP PROCEDURE add_sms_consent_cols;

-- 5) 초기 템플릿 시드 (TPLmeR2s = 이미 LGU+ 에 등록된 템플릿)
INSERT IGNORE INTO sms_templates (name, category, template_code, content, msg_type)
VALUES ('데일리에프앤아이', '상담', 'TPLmeR2s', '기본 안내 메시지', 'SMS');
