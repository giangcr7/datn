BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE FUNCTION public.diploma_search_normalize(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
RETURN btrim(regexp_replace(lower(regexp_replace(
  translate(normalize(value, NFD), U&'\0110\0111', 'Dd'),
  U&'[\0300-\036f]', '', 'g')), '[[:space:]]+', ' ', 'g'));

CREATE FUNCTION public.diploma_search_snapshot(payload jsonb) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
RETURN public.diploma_search_normalize(
  coalesce(payload ->> 'fullName', '') || ' ' ||
  coalesce(payload ->> 'mssv', '') || ' ' ||
  coalesce(payload ->> 'soHieu', '') || ' ' ||
  coalesce(payload ->> 'soVaoSo', ''));

CREATE INDEX diploma_versions_search_snapshot_idx ON diploma_versions
USING gin (public.diploma_search_snapshot(payload) public.gin_trgm_ops);

CREATE INDEX diploma_versions_search_name_idx ON diploma_versions
USING gin (public.diploma_search_normalize(coalesce(payload ->> 'fullName', '')) public.gin_trgm_ops);

CREATE INDEX diploma_versions_search_legacy_idx ON diploma_versions(id)
WHERE NOT (payload ?& ARRAY['fullName', 'mssv', 'soHieu', 'soVaoSo']);

COMMIT;
