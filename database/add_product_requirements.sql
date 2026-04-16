-- 상품 접수 요건 테이블 확장
-- - 파일 슬롯(file input) 정보는 기존 slot_count / slot1_label / slot2_label 컬럼 유지
-- - 추가: 체크박스 전용 상품 대응 (한투저축 "전송시체크" 등)
--
-- case_type:
--   'file'     → 파일 첨부 필수
--   'checkbox' → 무서류 + 체크박스만 필요
--   'both'     → 파일 + 체크박스 둘 다
--   'none'     → 요건 없음 (거의 없음)

CREATE TABLE IF NOT EXISTS product_file_slots (
  fidx INT PRIMARY KEY,
  slot_count INT DEFAULT 0,
  slot1_label VARCHAR(200) DEFAULT NULL,
  slot2_label VARCHAR(200) DEFAULT NULL,
  scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 체크박스/케이스 타입 컬럼 추가 (이미 있으면 무시)
ALTER TABLE product_file_slots
  ADD COLUMN IF NOT EXISTS case_type VARCHAR(20) DEFAULT 'file' AFTER slot_count,
  ADD COLUMN IF NOT EXISTS checkbox_name VARCHAR(200) DEFAULT NULL AFTER slot2_label,
  ADD COLUMN IF NOT EXISTS checkbox_label VARCHAR(300) DEFAULT NULL AFTER checkbox_name;
