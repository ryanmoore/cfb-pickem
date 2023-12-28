#!/bin/sh
python manage.py collectstatic --no-input
gunicorn cfb_pickem.wsgi:application --bind 0.0.0.0:8000 --access-logfile - --error-logfile - --workers=2
