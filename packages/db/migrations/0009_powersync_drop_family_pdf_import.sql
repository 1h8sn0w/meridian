DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND schemaname = 'public' AND tablename = 'family'
  ) THEN
    ALTER PUBLICATION powersync DROP TABLE "family";
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND schemaname = 'public' AND tablename = 'pdf_import'
  ) THEN
    ALTER PUBLICATION powersync DROP TABLE "pdf_import";
  END IF;
END
$$;

REVOKE SELECT ON TABLE "family", "pdf_import" FROM powersync_role;
