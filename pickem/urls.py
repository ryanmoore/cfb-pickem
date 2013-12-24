''' urls for pickem site
'''
from django.conf.urls import patterns, url
import django.contrib.auth.views

from pickem import views

# pylint: disable=E1120

urlpatterns = patterns('',
       url(r'^$', views.IndexView.as_view(), name='index'),
       url(r'^game/(?P<pk>\d+)/$', views.GameView.as_view(), name='game'),
       url(r'^user/picks/edit/$', views.select_all, name='select_all'),
       url(r'^login/$', django.contrib.auth.views.login, name='login',
           kwargs={'template_name': 'pickem/registration/login.html'}),
       url(r'^logout/$', django.contrib.auth.views.logout, name='logout',
           kwargs={'template_name': 'pickem/registration/logout.html'}),
       url(r'^scoreboard/$', views.ScoreView.as_view(), name='scores'),
       url(r'^picks/$', views.PicksView.as_view(), name='picks'),
       url(r'^pretty_picks/$',
           views.PrettyPicksView.as_view(),
           name='pretty_picks'),
)
