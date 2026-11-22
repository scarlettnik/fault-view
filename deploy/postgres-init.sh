#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set app_password="$FAULTVIEW_POSTGRES_PASSWORD" <<'SQL'
CREATE ROLE faultview LOGIN PASSWORD :'app_password';
ALTER DATABASE faultview OWNER TO faultview;
REVOKE CONNECT ON DATABASE faultview FROM PUBLIC;
GRANT CONNECT ON DATABASE faultview TO faultview;
ALTER SCHEMA public OWNER TO faultview;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
