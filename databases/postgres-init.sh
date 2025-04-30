#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

# Execute SQL commands using psql, substituting environment variables
# Note: Use the default POSTGRES_USER (usually 'postgres') to create other users/dbs
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create users only if they don't exist
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${AUTH_DB_USER}') THEN
            CREATE USER ${AUTH_DB_USER} WITH PASSWORD '${AUTH_DB_PASSWORD}';
        END IF;
    END
    \$\$;

    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${CHAT_DB_USER}') THEN
            CREATE USER ${CHAT_DB_USER} WITH PASSWORD '${CHAT_DB_PASSWORD}';
        END IF;
    END
    \$\$;

    -- Create databases only if they don't exist
    SELECT 'CREATE DATABASE ${AUTH_DB_NAME}' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${AUTH_DB_NAME}')\gexec
    SELECT 'CREATE DATABASE ${CHAT_DB_NAME}' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${CHAT_DB_NAME}')\gexec

    -- Grant privileges on auth_db
    GRANT ALL PRIVILEGES ON DATABASE ${AUTH_DB_NAME} TO ${AUTH_DB_USER};

    -- Grant privileges on chat_db
    GRANT ALL PRIVILEGES ON DATABASE ${CHAT_DB_NAME} TO ${CHAT_DB_USER};
EOSQL

# Grant schema privileges - connect to each DB separately
echo "Granting privileges on database: ${AUTH_DB_NAME}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "${AUTH_DB_NAME}" <<-EOSQL
    GRANT ALL PRIVILEGES ON SCHEMA public TO ${AUTH_DB_USER};
    ALTER DATABASE ${AUTH_DB_NAME} OWNER TO ${AUTH_DB_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${AUTH_DB_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${AUTH_DB_USER};
    -- Grant on existing objects just in case
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${AUTH_DB_USER};
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${AUTH_DB_USER};
EOSQL

echo "Granting privileges on database: ${CHAT_DB_NAME}"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "${CHAT_DB_NAME}" <<-EOSQL
    GRANT ALL PRIVILEGES ON SCHEMA public TO ${CHAT_DB_USER};
    ALTER DATABASE ${CHAT_DB_NAME} OWNER TO ${CHAT_DB_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${CHAT_DB_USER};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${CHAT_DB_USER};
    -- Grant on existing objects just in case
    GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${CHAT_DB_USER};
    GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${CHAT_DB_USER};
EOSQL

echo "PostgreSQL initialization script finished."

# Note: Loading specific schema/data files (.sql) would still need separate
# psql commands within this script if you uncomment them, e.g.:
# psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "${AUTH_DB_NAME}" < /docker-entrypoint-initdb.d/migrations/001_initial_schema.sql