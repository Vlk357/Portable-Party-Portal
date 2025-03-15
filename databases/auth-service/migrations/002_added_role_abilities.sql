-- Migration: Initial Schema
-- Version: 002
-- Created: 2025-03-15

\connect auth_db;

BEGIN;

CREATE TABLE role_abilities (
    role_id INT REFERENCES roles(id),
    ability_id INT REFERENCES abilities(id),
    expires_at TIMESTAMP,
    PRIMARY KEY (role_id, ability_id)
);

COMMIT;