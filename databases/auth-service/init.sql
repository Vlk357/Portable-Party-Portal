-- Create auth database
CREATE DATABASE auth_db;
\c auth_db;

-- Load schema
\i /docker-entrypoint-initdb.d/migrations/001_initial_schema.sql

-- Load functions
\i /docker-entrypoint-initdb.d/functions/audit_triggers.sql

-- Load seed data
\i /docker-entrypoint-initdb.d/seeds/001_default_roles.sql