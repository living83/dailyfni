-- 상품 접수 요건 테이블 확장
-- MySQL 5.7 / 8.0 모두 호환되도록 INFORMATION_SCHEMA 기반 조건부 ALTER 사용
-- (MySQL 8.0.29 미만은 `ADD COLUMN IF NOT EXISTS` 지원 안 함)

-- 테이블이 없으면 생성
CREATE TABLE IF NOT EXISTS product_file_slots (
  fidx INT PRIMARY KEY,
  slot_count INT DEFAULT 0,
  slot1_label VARCHAR(200) DEFAULT NULL,
  slot2_label VARCHAR(200) DEFAULT NULL,
  scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 컬럼 조건부 추가를 위한 프로시저 (실행 후 삭제)
DROP PROCEDURE IF EXISTS add_product_requirements_cols;
DELIMITER //
CREATE PROCEDURE add_product_requirements_cols()
BEGIN
  DECLARE col_count INT;

  -- case_type
  SELECT COUNT(*) INTO col_count FROM INFORMATION_SCHEMA.COLUMNS
    WHERE table_schema = DATABASE() AND table_name = 'product_file_slots' AND column_name = 'case_type';
  IF col_count = 0 THEN
    ALTER TABLE product_file_slots ADD COLUMN case_type VARCHAR(20) DEFAULT 'file' AFTER slot_count;
  END IF;

  -- checkbox_name
  SELECT COUNT(*) INTO col_count FROM INFORMATION_SCHEMA.COLUMNS
    WHERE table_schema = DATABASE() AND table_name = 'product_file_slots' AND column_name = 'checkbox_name';
  IF col_count = 0 THEN
    ALTER TABLE product_file_slots ADD COLUMN checkbox_name VARCHAR(200) DEFAULT NULL AFTER slot2_label;
  END IF;

  -- checkbox_label
  SELECT COUNT(*) INTO col_count FROM INFORMATION_SCHEMA.COLUMNS
    WHERE table_schema = DATABASE() AND table_name = 'product_file_slots' AND column_name = 'checkbox_label';
  IF col_count = 0 THEN
    ALTER TABLE product_file_slots ADD COLUMN checkbox_label VARCHAR(300) DEFAULT NULL AFTER checkbox_name;
  END IF;
END //
DELIMITER ;

CALL add_product_requirements_cols();
DROP PROCEDURE add_product_requirements_cols;
