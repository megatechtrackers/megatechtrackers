-- Grant external access privileges for root and frappe users
-- This script runs automatically when MariaDB container starts for the first time

-- Grant privileges to root user from localhost (for connections via Docker port mapping)
GRANT ALL PRIVILEGES ON *.* TO 'root'@'localhost' IDENTIFIED BY 'admin' WITH GRANT OPTION;

-- Grant privileges to root user from any host (for remote connections)
GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' IDENTIFIED BY 'admin' WITH GRANT OPTION;

-- Grant privileges to frappe user from localhost
GRANT ALL PRIVILEGES ON frappe.* TO 'frappe'@'localhost' IDENTIFIED BY 'frappe';

-- Grant privileges to frappe user from any host
GRANT ALL PRIVILEGES ON frappe.* TO 'frappe'@'%' IDENTIFIED BY 'frappe';

-- Flush privileges to apply changes
FLUSH PRIVILEGES;
