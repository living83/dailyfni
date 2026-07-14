-- 매출/수당 정산 데이터 정리 마이그레이션 (재실행 안전)
-- 원래는 "윤장호만 삭제" 용이었지만, 근본 원인이 '가승인/부결 등을 settlement_executions
-- 에 저장하던 sync 버그' 라서 이 기회에 모두 정리한다.
--
-- 지우는 대상:
--   1) TRIM(status) 가 '승인' 이 아닌 모든 실행 건
--      (가승인/부결/진행후부결/접수/심사/조회중 등 — 매출 집계에 들어가면 안 됨)
--   2) TRIM(customer_name) 또는 TRIM(assigned_to) 가 '윤장호' 인 실행 건
--
-- 실행 후: settlement_executions 에는 오직 '승인' 상태, 윤장호 아닌 건만 남는다.

DELETE FROM settlement_executions
WHERE TRIM(status) <> '승인'
   OR TRIM(customer_name) = '윤장호'
   OR TRIM(assigned_to) = '윤장호';

-- 감사 로그 (audit_logs 있을 때만)
DROP PROCEDURE IF EXISTS log_settlement_purge;
DELIMITER //
CREATE PROCEDURE log_settlement_purge()
BEGIN
  DECLARE tbl_exists INT;
  SELECT COUNT(*) INTO tbl_exists FROM INFORMATION_SCHEMA.TABLES
    WHERE table_schema = DATABASE() AND table_name = 'audit_logs';
  IF tbl_exists > 0 THEN
    INSERT INTO audit_logs (event_type, target_type, after_value, performed_by, performed_at)
    VALUES ('settlement_change', 'execution', '정산 정리: 승인 아닌 상태 + 윤장호 건 영구 삭제 (마이그레이션)', 'system', NOW());
  END IF;
END //
DELIMITER ;
CALL log_settlement_purge();
DROP PROCEDURE log_settlement_purge;
