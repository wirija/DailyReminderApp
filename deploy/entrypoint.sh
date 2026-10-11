#!/bin/sh
set -eu
case "${1:-web}" in
  web)
    python manage.py migrate --noinput
    python manage.py createcachetable
    python manage.py create_huey_tables
    exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 2 --threads 4 --timeout 120 --access-logfile - --access-logformat '%(h)s %(m)s %(U)s %(s)s %(L)s' --error-logfile -
    ;;
  worker)
    exec python manage.py run_huey
    ;;
  *) exec "$@" ;;
esac
