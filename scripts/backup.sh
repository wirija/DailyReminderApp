#!/bin/sh
# Run from the repository root. Backups include confidential records and files.
set -eu
umask 077
backup_dir="${1:-backups/$(date +%Y%m%d-%H%M%S)}"
if [ -e "$backup_dir" ]; then
    printf 'Choose a new backup directory; %s already exists.\n' "$backup_dir" >&2
    exit 1
fi
mkdir -p "$backup_dir"
# Stop writers so the database and uploaded files represent one recovery point.
docker compose stop web worker
trap 'docker compose start web worker >/dev/null' EXIT HUP INT TERM
docker compose exec -T db pg_dump -U planner -d planner --format=custom > "$backup_dir/database.dump"
docker compose run --rm --no-deps -T --entrypoint tar web -C /data/media -czf - . > "$backup_dir/media.tar.gz"
cp .env "$backup_dir/environment.env"
printf 'Backup saved to %s. Store an encrypted copy off this server.\n' "$backup_dir"
