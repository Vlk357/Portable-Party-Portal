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

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO auth_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO auth_user;

-- Load schema
\i /docker-entrypoint-initdb.d/migrations/001_initial_schema.sql

-- Grant permissions on existing tables and sequences
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO auth_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO auth_user;

-- Load functions
\i /docker-entrypoint-initdb.d/functions/audit_triggers.sql

-- Load seed data
-- \i /docker-entrypoint-initdb.d/seeds/001_default_roles.sql

-- Connect to chat_db and set up permissions
\c chat_db
GRANT ALL PRIVILEGES ON DATABASE chat_db TO chat_user;
GRANT ALL PRIVILEGES ON SCHEMA public TO chat_user;
ALTER DATABASE chat_db OWNER TO chat_user;