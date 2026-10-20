-- Asnaf PostgreSQL application roles.
-- Run via backend/scripts/create-db-users.sh (sets the psql variables).
--
-- asnaf_admin  — مدیریت: مالک اسکیما، DDL + DML، Prisma migrate
-- asnaf_portal — پورتال کاربری: فقط DML، بدون ALTER/DROP/CREATE

\if :{?admin_role}
\else
  \echo 'admin_role is required. Use scripts/create-db-users.sh'
  \quit 1
\endif

SELECT set_config('asnaf.admin_role', :'admin_role', false);
SELECT set_config('asnaf.portal_role', :'portal_role', false);
SELECT set_config('asnaf.admin_password', :'admin_password', false);
SELECT set_config('asnaf.portal_password', :'portal_password', false);
SELECT set_config('asnaf.admin_db_flag', :'admin_db_flag', false);
SELECT set_config('asnaf.harden_public', :'harden_public', false);

DO $asnaf$
DECLARE
  admin_role text := current_setting('asnaf.admin_role');
  portal_role text := current_setting('asnaf.portal_role');
  admin_password text := current_setting('asnaf.admin_password');
  portal_password text := current_setting('asnaf.portal_password');
  admin_db_flag text := current_setting('asnaf.admin_db_flag');
  db_name text := current_database();
  rec record;
  internal_tables text[] := ARRAY[
    'project_groups',
    'projects',
    'project_documents',
    'project_operators',
    'project_phases',
    'stored_files',
    'project_progress_entries',
    'project_progress_images',
    'project_contractors',
    'project_contractor_projects',
    'project_contractor_members',
    'project_contractor_phases',
    'project_contractor_payments',
    'foods',
    'restaurants',
    'restaurant_menu_items',
    'organization_unit_restaurants',
    'food_reservations',
    'vehicle_brands',
    'vehicles',
    'vehicle_assignments',
    'organizations',
    'organization_phones',
    'organization_positions',
    'organization_unit_kinds',
    'organization_units',
    'staff_posts',
    'singard_categories',
    'singard_feedbacks',
    'singard_attachments',
    'singard_activities',
    'board_requests',
    'board_attachments',
    'board_stage_units',
    'board_stage_positions',
    'board_minutes',
    'board_minutes_members',
    'board_minutes_attachments',
    'board_minutes_resolutions',
    'scheduled_jobs',
    'scheduled_job_runs',
    'sms_settings',
    'role_permissions',
    'commercial_floors',
    'commercial_lanes',
    'commercial_units',
    '_prisma_migrations'
  ];
  tbl text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = current_user
      AND rolsuper
  ) THEN
    RAISE EXCEPTION 'این اسکریپت باید با کاربر superuser اجرا شود (الان: %)', current_user;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = admin_role) THEN
    EXECUTE format(
      'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER %s NOCREATEROLE INHERIT NOREPLICATION',
      admin_role,
      admin_password,
      admin_db_flag
    );
  ELSE
    EXECUTE format(
      'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER %s NOCREATEROLE INHERIT NOREPLICATION',
      admin_role,
      admin_password,
      admin_db_flag
    );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = portal_role) THEN
    EXECUTE format(
      'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION',
      portal_role,
      portal_password
    );
  ELSE
    EXECUTE format(
      'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION',
      portal_role,
      portal_password
    );
  END IF;

  EXECUTE format(
    'COMMENT ON ROLE %I IS %L',
    admin_role,
    'Asnaf management API: schema owner, Prisma migrate, full DML'
  );
  EXECUTE format(
    'COMMENT ON ROLE %I IS %L',
    portal_role,
    'Asnaf public portal API: DML only, no DDL, no internal admin modules'
  );
  EXECUTE format('ALTER ROLE %I SET search_path TO public', admin_role);
  EXECUTE format('ALTER ROLE %I SET search_path TO public', portal_role);

  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I, %I', db_name, admin_role, portal_role);
  EXECUTE format('GRANT TEMP ON DATABASE %I TO %I, %I', db_name, admin_role, portal_role);

  IF current_setting('asnaf.harden_public') = 'on' THEN
    EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', db_name);
    REVOKE ALL ON SCHEMA public FROM PUBLIC;
  END IF;

  EXECUTE format('GRANT USAGE, CREATE ON SCHEMA public TO %I', admin_role);
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', portal_role);
  EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %I', portal_role);

  FOR rec IN
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm')
  LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO %I', rec.name, admin_role);
  END LOOP;

  FOR rec IN
    SELECT c.relname AS name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
  LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO %I', rec.name, admin_role);
  END LOOP;

  FOR rec IN
    SELECT t.typname AS name
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typtype = 'e'
  LOOP
    EXECUTE format('ALTER TYPE public.%I OWNER TO %I', rec.name, admin_role);
  END LOOP;

  FOR rec IN
    SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) OWNER TO %I',
      rec.name,
      rec.args,
      admin_role
    );
  END LOOP;

  EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA public TO %I', admin_role);
  EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO %I', admin_role);
  EXECUTE format('GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO %I', admin_role);

  FOR rec IN
    SELECT t.typname AS name
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typtype = 'e'
  LOOP
    EXECUTE format(
      'GRANT USAGE ON TYPE public.%I TO %I, %I',
      rec.name,
      admin_role,
      portal_role
    );
  END LOOP;

  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', portal_role);
  EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', portal_role);
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I',
    portal_role
  );
  EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', portal_role);

  FOREACH tbl IN ARRAY internal_tables LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = tbl
        AND c.relkind IN ('r', 'p', 'v', 'm')
    ) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', tbl, portal_role);
    END IF;
  END LOOP;

  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON TABLES TO %I',
    admin_role,
    admin_role
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON SEQUENCES TO %I',
    admin_role,
    admin_role
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
    admin_role,
    portal_role
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I',
    admin_role,
    portal_role
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE ON TYPES TO %I',
    admin_role,
    portal_role
  );

  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT ALL ON TABLES TO %I',
    current_user,
    admin_role
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
    current_user,
    portal_role
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I',
    current_user,
    portal_role
  );
END
$asnaf$;

SELECT
  r.rolname AS role,
  r.rolcanlogin AS can_login,
  r.rolsuper AS superuser,
  r.rolcreatedb AS createdb,
  r.rolcreaterole AS createrole
FROM pg_roles r
WHERE r.rolname IN (:'admin_role', :'portal_role')
ORDER BY r.rolname;
