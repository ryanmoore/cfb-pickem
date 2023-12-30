# syntax=docker/dockerfile:1
# BUILD

FROM python:3.10-alpine as builder
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

RUN apk update
RUN apk add \
    build-base \
    linux-headers \
    pcre-dev \
    libc-dev \
    libffi-dev \
    openssl-dev \
    python3-dev \
    libxml2-dev \
    libxslt-dev \
    postgresql-dev \
    musl-dev

RUN pip install --upgrade pip
WORKDIR /usr/src/app

COPY ./requirements.txt .
RUN pip wheel --no-cache-dir --no-deps --wheel-dir /usr/src/app/wheels -r requirements.txt gunicorn

# FINAL

FROM python:3.10-alpine
ENV DJANGO_USER=django-pickem
ENV APP_DIR=/home/$DJANGO_USER/web/

RUN pip install --upgrade pip
RUN mkdir -p /home/$DJANGO_USER
RUN addgroup -S $DJANGO_USER && adduser -S $DJANGO_USER -G $DJANGO_USER

RUN mkdir $APP_DIR
WORKDIR $APP_DIR

# install dependencies
RUN apk update
RUN apk add libpq
COPY --from=builder /usr/src/app/wheels /wheels
COPY --from=builder /usr/src/app/requirements.txt .

RUN pip install --no-cache /wheels/*

COPY manage.py pickem_uwsgi.ini deploy/run.sh $APP_DIR
COPY cfb_pickem $APP_DIR/cfb_pickem
COPY pickem $APP_DIR/pickem
COPY templates $APP_DIR/templates
RUN chown -R $DJANGO_USER:$DJANGO_USER $APP_DIR
USER $DJANGO_USER

CMD ["sh", "run.sh"]
