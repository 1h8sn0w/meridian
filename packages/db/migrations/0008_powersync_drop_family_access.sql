DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND schemaname = 'public' AND tablename = 'family_member'
  ) THEN
    ALTER PUBLICATION powersync DROP TABLE "family_member";
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'powersync' AND schemaname = 'public' AND tablename = 'family_invite'
  ) THEN
    ALTER PUBLICATION powersync DROP TABLE "family_invite";
  END IF;
END
$$;

REVOKE SELECT ON TABLE "family_member", "family_invite" FROM powersync_role;
