Pickem
==========

Pickem is a web app for confidence ranking of head-to-head-matchups. Users pick sides and then assign confidence scores to their picks. Correct picks with higher confidences award more points.

Prerequisites
-------------
Python3, pip, recommended fresh virtualenv

Needed packages: lxml

On Debian:
```sh
    sudo apt install libxml2-dev libxslt-dev python-dev libssl-dev libffi-dev
```

Installation
------------

```sh
    pip install -r requirements.txt
    python manage.py migrate
    python manage.py runserver
```
