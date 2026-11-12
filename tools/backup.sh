#!/usr/bin/env bash
# Makes a compressed backup of the whole database. Run it from any machine that can reach the database.
#   DATABASE_URL="postgresql://..." tools/backup.sh [folder] [keep]
# Use the DIRECT connection string from Supabase (port 5432), not the pooled one: pg_dump needs a normal connection.
# This backs up the database only. Uploaded files live in the Supabase Storage bucket and are not included (see docs/OPERATIONS.md).
set -euo pipefail
: "${DATABASE_URL:?Set DATABASE_URL to the direct database connection string}"
DIR="${1:-backups}"; KEEP="${2:-14}"
mkdir -p "$DIR"
FILE="$DIR/kok-$(date -u +%Y%m%d-%H%M%S).dump"
pg_dump --format=custom --no-owner --no-privileges --file="$FILE" "$DATABASE_URL"
echo "Backup written: $FILE ($(du -h "$FILE" | cut -f1))"
# Keep only the newest $KEEP backups in the folder.
ls -1t "$DIR"/kok-*.dump | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "Verifying the file can be read..."
pg_restore --list "$FILE" > /dev/null && echo "OK: the backup is a valid archive."
