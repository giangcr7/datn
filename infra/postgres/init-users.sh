#!/bin/sh
set -eu
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=app_password="$APP_DB_PASSWORD" --set=migrator_password="$MIGRATOR_DB_PASSWORD" <<'SQL'
CREATE ROLE diplomachain_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'migrator_password';
CREATE ROLE diplomachain_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'app_password';
ALTER DATABASE diplomachain OWNER TO diplomachain_migrator;
GRANT CONNECT ON DATABASE diplomachain TO diplomachain_app;
GRANT USAGE ON SCHEMA public TO diplomachain_app;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE diplomachain_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO diplomachain_app;
ALTER DEFAULT PRIVILEGES FOR ROLE diplomachain_migrator IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO diplomachain_app;
SQL

