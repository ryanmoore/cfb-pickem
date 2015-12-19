''' urls for pickem site
'''
from django.conf.urls import patterns, url, include
import django.contrib.auth.views
from django.views.generic import RedirectView

from pickem import views

# pylint: disable=E1120

urlpatterns = [
        url(r'^$', views.IndexView.as_view(), name='index-bare',
            kwargs={'year': '2015'}),
        url(r'^(?P<year>\d{4})/$', views.IndexView.as_view(), name='index'),
        url(r'^(?P<year>\d{4})/game/(?P<pk>\d+)/$', views.GameView.as_view(), name='game'),
        url(r'^(?P<year>\d{4})/user/picks/edit/$', views.select_all, name='select_all'),
        url(r'^(?P<year>\d{4})/scoreboard/$', views.ScoreView.as_view(), name='scores'),
        url(r'^(?P<year>\d{4})/picks/$',
            views.PrettyPicksView.as_view(),
            name='picks'),
        url(r'^(?P<year>\d{4})/picks/table$', views.PicksView.as_view(), name='picks_table'),
        url(r'^login/$', django.contrib.auth.views.login, name='login',
            kwargs={'template_name': 'pickem/registration/login.html'}),
        url(r'^logout/$', django.contrib.auth.views.logout, name='logout',
            kwargs={'template_name': 'pickem/registration/logout.html'}),
        ]
