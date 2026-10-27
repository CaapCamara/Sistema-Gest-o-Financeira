#!/usr/bin/env bash
# Testa as migrações e regras de negócio num PostgreSQL puro (sem Docker do Supabase).
# Uso: PGHOST=... PGPORT=... PGUSER=postgres npm run db:test
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${TEST_DB:-gf_teste}
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/tests/stub_supabase.sql
for f in supabase/migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$f"
done
for f in supabase/tests/teste_*.sql; do
  psql -v ON_ERROR_STOP=1 -d "$DB" -f "$f" | tail -3
done
