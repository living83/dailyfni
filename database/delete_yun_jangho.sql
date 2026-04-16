-- 윤장호(본사/심사자) 관련 정산 레코드 영구 삭제
-- 어느 컬럼에 들어갔든 잡히도록 customer_name / assigned_to 를 모두 확인한다.
-- 재실행 시 이미 없으면 0건 삭제 (idempotent).

DELETE FROM settlement_executions
WHERE TRIM(customer_name) = '윤장호'
   OR TRIM(assigned_to) = '윤장호';

-- 감사 로그 남기기 (audit_logs 테이블 존재 시에만)
-- 프로시저로 처리해 테이블이 없어도 에러 안 남
DROP PROCEDURE IF EXISTS log_yunjangho_purge;
DELIMITER //
CREATE PROCEDURE log_yunjangho_purge()
BEGIN
  DECLARE tbl_exists INT;
  SELECT COUNT(*) INTO tbl_exists FROM INFORMATION_SCHEMA.TABLES
    WHERE table_schema = DATABASE() AND table_name = 'audit_logs';
  IF tbl_exists > 0 THEN
    INSERT INTO audit_logs (event_type, target_type, after_value, performed_by, performed_at)
    VALUES ('settlement_change', 'execution', '윤장호 레코드 영구 삭제 (마이그레이션)', 'system', NOW());
  END IF;
END //
DELIMITER ;
CALL log_yunjangho_purge();
DROP PROCEDURE log_yunjangho_purge;
