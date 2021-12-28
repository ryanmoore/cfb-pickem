# syntax=docker/dockerfile:1
FROM python:3.10-alpine
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /code
COPY requirements.txt /code/
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
RUN pip install -r requirements.txt
COPY cfb_pickem /code/
COPY pickem /code/
COPY templates /code/
