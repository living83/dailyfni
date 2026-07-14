USE dailyfni;

CREATE TABLE IF NOT EXISTS intake_customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  content TEXT DEFAULT '',
  source VARCHAR(50) DEFAULT '홈페이지',
  status ENUM('pending', 'processed', 'rejected') DEFAULT 'pending',
  assigned_to VARCHAR(50) DEFAULT '',
  reject_reason VARCHAR(255) DEFAULT '',
  processed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_date (created_at)
);
