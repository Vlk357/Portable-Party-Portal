-- Create users with limited privileges
CREATE USER auth_user WITH PASSWORD 'auth_password';
CREATE USER chat_user WITH PASSWORD 'chat_password';

-- Create databases
CREATE DATABASE auth_db;
CREATE DATABASE chat_db;

-- Connect to auth_db and set up permissions
\c auth_db
GRANT ALL PRIVILEGES ON DATABASE auth_db TO auth_user;
GRANT ALL PRIVILEGES ON SCHEMA public TO auth_user;
ALTER DATABASE auth_db OWNER TO auth_user;

-- Connect to chat_db and set up permissions
\c chat_db
GRANT ALL PRIVILEGES ON DATABASE chat_db TO chat_user;
GRANT ALL PRIVILEGES ON SCHEMA public TO chat_user;
ALTER DATABASE chat_db OWNER TO chat_user;