from django.test import TestCase, Client
from django.contrib.auth.models import User
import django.utils.timezone as timezone
from django.conf import settings
from unittest import skip
from unittest.mock import patch, Mock, ANY
from django.urls import reverse

import pickem.views as views
import base64
import datetime

"""
About headers:
    Don't: Authorization
    Do: HTTP_AUTHORIZATION

Why? https://stackoverflow.com/a/54675636 . Django is looking for a CGI request,
so convert headers appropriately

"""


class TestAuth(TestCase):
    def test_login(self):
        user = User.objects.create_user(username="alice", password="alicep")
        user.save()
        client = Client()
        # self.assertTrue(client.login(username="alice", password="alicep"))
        encoded_auth = base64.b64encode(b"alice:alicep")
        response = client.post(
            "/api/auth/login/",
            HTTP_AUTHORIZATION=f"Basic {encoded_auth.decode()}",
        )
        self.assertEqual(
            response.json(),
            {
                'expiry': ANY,
                'token': ANY,
                'user': {'id': 1, 'username': 'alice', 'groups': [], 'is_superuser': False},
                'token_expires': ANY,
             }
        )
