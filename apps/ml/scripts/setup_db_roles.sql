-- Read-only role for ML on public schema
CREATE ROLE ml_reader WITH LOGIN PASSWORD 'ml_reader_password';
GRANT CONNECT ON DATABASE trades_db TO ml_reader;
GRANT USAGE ON SCHEMA public TO ml_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ml_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ml_reader;

-- Read/write role for ML on ml schema
CREATE ROLE ml_writer WITH LOGIN PASSWORD 'ml_writer_password';
GRANT CONNECT ON DATABASE trades_db TO ml_writer;
GRANT USAGE ON SCHEMA public TO ml_writer;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ml_writer;
GRANT USAGE, CREATE ON SCHEMA ml TO ml_writer;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ml TO ml_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA ml GRANT ALL PRIVILEGES ON TABLES TO ml_writer;
