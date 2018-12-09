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
    python manage.py collectstatic
    python manage.py runserver
```

JS Setup
--------

Install [nvm](https://github.com/creationix/nvm) as recommended. Usually:

```sh
    curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.32.1/install.sh | bash
```

Then grab node, npm, and install the packages for the project:

```sh
    nvm install node
    cd pickem-react
    npm install
```

If you have the Django server running, you should be ready to launch from that folder with:

```sh
    npm start
```

2018 Updates
============

Trying to update a bunch of packages. Install yarn:

https://yarnpkg.com/en/docs/install#debian-stable


and we're using nvm, so:

```
sudo apt-get update && sudo apt-get install --no-install-recommends yarn
```


Updated node as well:

```
nvm install stable
```
