#!/usr/bin/env bash
# ایجاد یوزرهای PostgreSQL برای API مدیریت و پورتال کاربری.
# روی لوکال و سرور همین اسکریپت را اجرا کنید (با --env local یا --env server).
#
#   cp scripts/db-users.env.example scripts/db-users.env
#   ./scripts/create-db-users.sh --env local
#   ./scripts/create-db-users.sh --env server
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SQL_FILE="$SCRIPT_DIR/create-db-users.sql"
ENV_FILE="$SCRIPT_DIR/db-users.env"
ASNAF_ENV=""
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: ./scripts/create-db-users.sh --env local|server [--env-file PATH] [--dry-run]

  --env local     یوزر مدیریت CREATEDB دارد (برای prisma migrate dev)
  --env server    بدون CREATEDB؛ CONNECT از PUBLIC گرفته می‌شود
  --env-file      فایل متغیرها (پیش‌فرض: scripts/db-users.env)
  --dry-run       SQL را با متغیرها نشان بده، اجرا نکن

Required env (or scripts/db-users.env):
  PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD
  ASNAF_ADMIN_PASSWORD ASNAF_PORTAL_PASSWORD

Optional:
  ASNAF_ADMIN_USER   (default: asnaf_admin)
  ASNAF_PORTAL_USER  (default: asnaf_portal)
  PSQL               (path to psql)
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --env)
      ASNAF_ENV="${2:-}"
      shift 2
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ "$ASNAF_ENV" != "local" ] && [ "$ASNAF_ENV" != "server" ]; then
  echo "--env local یا --env server لازم است" >&2
  usage >&2
  exit 1
fi

load_env_file() {
  local file=$1
  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    case "$line" in
      ''|\#*|\;*) continue ;;
    esac
    case "$line" in
      *=*) ;;
      *) continue ;;
    esac
    key=${line%%=*}
    value=${line#*=}
    case "$key" in
      *[!A-Za-z0-9_]*) continue ;;
    esac
    if [ "${#value}" -ge 2 ]; then
      case "$value" in
        \'*\') value=${value#\'}; value=${value%\'} ;;
        \"*\") value=${value#\"}; value=${value%\"} ;;
      esac
    fi
    export "$key=$value"
  done < "$file"
}

if [ -f "$ENV_FILE" ]; then
  load_env_file "$ENV_FILE"
fi

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-asnaf}"
PGUSER="${PGUSER:-postgres}"
ADMIN_USER="${ASNAF_ADMIN_USER:-asnaf_admin}"
PORTAL_USER="${ASNAF_PORTAL_USER:-asnaf_portal}"
ADMIN_PASSWORD="${ASNAF_ADMIN_PASSWORD:-}"
PORTAL_PASSWORD="${ASNAF_PORTAL_PASSWORD:-}"

if [ -z "${PGPASSWORD:-}" ]; then
  echo "PGPASSWORD برای کاربر superuser تنظیم نشده است" >&2
  exit 1
fi

if [ "$ASNAF_ENV" = "local" ]; then
  ADMIN_DB_FLAG=CREATEDB
  HARDEN_PUBLIC=off
  if [ -z "$ADMIN_PASSWORD" ]; then
    ADMIN_PASSWORD=asnaf_admin_local
    echo "هشدار: ASNAF_ADMIN_PASSWORD خالی بود؛ از asnaf_admin_local استفاده شد." >&2
  fi
  if [ -z "$PORTAL_PASSWORD" ]; then
    PORTAL_PASSWORD=asnaf_portal_local
    echo "هشدار: ASNAF_PORTAL_PASSWORD خالی بود؛ از asnaf_portal_local استفاده شد." >&2
  fi
else
  ADMIN_DB_FLAG=NOCREATEDB
  HARDEN_PUBLIC=on
  if [ "${#ADMIN_PASSWORD}" -lt 16 ] || [ "${#PORTAL_PASSWORD}" -lt 16 ]; then
    echo "روی سرور ASNAF_ADMIN_PASSWORD و ASNAF_PORTAL_PASSWORD باید حداقل ۱۶ کاراکتر باشند" >&2
    exit 1
  fi
fi

if [ "$ADMIN_USER" = "$PORTAL_USER" ]; then
  echo "نام یوزر مدیریت و پورتال نباید یکی باشد" >&2
  exit 1
fi

if [ ! -f "$SQL_FILE" ]; then
  echo "فایل SQL پیدا نشد: $SQL_FILE" >&2
  exit 1
fi

find_psql() {
  if [ -n "${PSQL:-}" ]; then
    printf '%s' "$PSQL"
    return
  fi
  if command -v psql >/dev/null 2>&1; then
    command -v psql
    return
  fi
  local found=""
  found=$(ls -d /c/Program\ Files/PostgreSQL/*/bin/psql.exe 2>/dev/null | sort | tail -n 1 || true)
  if [ -n "$found" ]; then
    printf '%s' "$found"
    return
  fi
  found=$(ls -d "/c/Program Files/PostgreSQL/"*/bin/psql.exe 2>/dev/null | sort | tail -n 1 || true)
  if [ -n "$found" ]; then
    printf '%s' "$found"
    return
  fi
  echo "psql پیدا نشد. PostgreSQL client را نصب کنید یا PSQL را تنظیم کنید." >&2
  exit 1
}

uri_encode() {
  if command -v python >/dev/null 2>&1; then
    python -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
    return
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
    return
  fi
  if command -v node >/dev/null 2>&1; then
    node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$1"
    return
  fi
  printf '%s' "$1"
}

export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD
export PGSSLMODE="${PGSSLMODE:-prefer}"

echo "محیط: $ASNAF_ENV"
echo "میزبان: $PGHOST:$PGPORT / $PGDATABASE"
echo "اجراکننده: $PGUSER"
echo "یوزر مدیریت: $ADMIN_USER ($ADMIN_DB_FLAG)"
echo "یوزر پورتال: $PORTAL_USER (DML only)"

if [ "$DRY_RUN" -eq 1 ]; then
  echo "dry-run: اجرا نمی‌شود."
  echo "  admin_role=$ADMIN_USER"
  echo "  portal_role=$PORTAL_USER"
  echo "  admin_db_flag=$ADMIN_DB_FLAG"
  echo "  harden_public=$HARDEN_PUBLIC"
  echo "  sql=$SQL_FILE"
  exit 0
fi

PSQL_BIN=$(find_psql)

echo "در حال ایجاد / به‌روزرسانی نقش‌ها..."
"$PSQL_BIN" \
  -v ON_ERROR_STOP=1 \
  -v "admin_role=$ADMIN_USER" \
  -v "portal_role=$PORTAL_USER" \
  -v "admin_password=$ADMIN_PASSWORD" \
  -v "portal_password=$PORTAL_PASSWORD" \
  -v "admin_db_flag=$ADMIN_DB_FLAG" \
  -v "harden_public=$HARDEN_PUBLIC" \
  -f "$SQL_FILE"

echo "در حال بررسی اتصال یوزرها..."
PGUSER="$ADMIN_USER" PGPASSWORD="$ADMIN_PASSWORD" "$PSQL_BIN" \
  -v ON_ERROR_STOP=1 \
  -c "SELECT current_user AS connected_as, current_database() AS db;" \
  >/dev/null

PGUSER="$PORTAL_USER" PGPASSWORD="$PORTAL_PASSWORD" "$PSQL_BIN" \
  -v ON_ERROR_STOP=1 \
  -c "SELECT current_user AS connected_as, current_database() AS db;" \
  >/dev/null

if PGUSER="$PORTAL_USER" PGPASSWORD="$PORTAL_PASSWORD" "$PSQL_BIN" \
  -v ON_ERROR_STOP=1 \
  -c "CREATE TABLE public.__asnaf_priv_probe (id int);" \
  >/dev/null 2>&1; then
  PGUSER="$ADMIN_USER" PGPASSWORD="$ADMIN_PASSWORD" "$PSQL_BIN" \
    -c "DROP TABLE IF EXISTS public.__asnaf_priv_probe;" >/dev/null 2>&1 || true
  echo "یوزر پورتال نباید بتواند جدول بسازد" >&2
  exit 1
fi

ADMIN_URL="postgresql://${ADMIN_USER}:$(uri_encode "$ADMIN_PASSWORD")@${PGHOST}:${PGPORT}/${PGDATABASE}?schema=public"
PORTAL_URL="postgresql://${PORTAL_USER}:$(uri_encode "$PORTAL_PASSWORD")@${PGHOST}:${PGPORT}/${PGDATABASE}?schema=public"

echo
echo "تمام شد. این مقادیر را در .env بگذارید:"
echo "  backend/.env            DATABASE_URL=$ADMIN_URL"
echo "  asnaf-portal-backend/.env DATABASE_URL=$PORTAL_URL"
echo
echo "بعد از prisma migrate، همین اسکریپت را دوباره اجرا کنید تا دسترسی پورتال روی جدول‌های جدید اعمال شود."
