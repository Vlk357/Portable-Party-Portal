-- Migration: Initial Schema
-- Version: 001
-- Created: 2025-02-26

BEGIN;

-- Custom types
CREATE TYPE user_status AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'LOCKED',
    'PENDING_ACTIVATION'
);

CREATE TYPE module_enum AS ENUM (
    'AUTH',
    'CHAT',
    'VIDEO',
    'GALLERY'
);

CREATE TYPE action_enum AS ENUM (
    'CREATE',
    'READ',
    'UPDATE',
    'DELETE',
    'MANAGE'
);

CREATE TYPE entity_type AS ENUM (
    'USER',
    'ROLE',
    'ABILITY',
    'USER_ROLE',
    'USER_ABILITY',
    'ROLE_ABILITY'
);

CREATE TYPE change_type AS ENUM (
    'CREATED',
    'UPDATED',
    'DELETED',
    'GRANTED',
    'REVOKED',
    'EXPIRED'
);

-- Tables
CREATE TABLE users (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash CHAR(60) NOT NULL,
    status user_status NOT NULL DEFAULT 'PENDING_ACTIVATION',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE login_log (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    ip_address VARCHAR(45) NOT NULL,
    logged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    success BOOLEAN NOT NULL,
    user_agent TEXT
);

CREATE TABLE roles (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE abilities (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    module module_enum NOT NULL,
    resource VARCHAR(100) NOT NULL,
    resource_constraint TEXT,
    action action_enum NOT NULL,
    description TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_roles (
    user_id INT REFERENCES users(id),
    role_id INT REFERENCES roles(id),
    expires_at TIMESTAMP,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE user_abilities (
    user_id INT REFERENCES users(id),
    ability_id INT REFERENCES abilities(id),
    resource_instance_id INT,
    expires_at TIMESTAMP,
    PRIMARY KEY (user_id, ability_id)
);

CREATE TABLE role_abilities (
    role_id INT REFERENCES roles(id),
    ability_id INT REFERENCES abilities(id),
    expires_at TIMESTAMP,
    PRIMARY KEY (role_id, ability_id)
);

CREATE TABLE audit_log (
    id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    entity_type entity_type NOT NULL,
    entity_id INT NOT NULL,
    related_entity_id INT,
    change_type change_type NOT NULL,
    field_name VARCHAR(50),
    old_value TEXT,
    new_value TEXT,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    changed_by INT NOT NULL REFERENCES users(id),
    ip_address VARCHAR(45) NOT NULL
);

-- Indexes
CREATE INDEX idx_login_log_user ON login_log(user_id);
CREATE INDEX idx_login_log_success ON login_log(success);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_changed_by ON audit_log(changed_by);

COMMIT;

-- Down Migration
/*
BEGIN;
DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS user_abilities;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS abilities;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS login_log;
DROP TABLE IF EXISTS users;

DROP TYPE IF EXISTS change_type;
DROP TYPE IF EXISTS entity_type;
DROP TYPE IF EXISTS action_enum;
DROP TYPE IF EXISTS module_enum;
DROP TYPE IF EXISTS user_status;
COMMIT;
*/