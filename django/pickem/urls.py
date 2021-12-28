''' urls for pickem site
'''
from django.urls import re_path
# import django.contrib.auth.views
from django.views.generic import RedirectView
from pickem import views

# pylint: disable=E1120

app_name = "pickem"

urlpatterns = [
        re_path(r'^$', views.IndexView.as_view(), name='index-bare',
            kwargs={'year': '2016'}),
        re_path(r'^(?P<year>\d{4})/$', views.IndexView.as_view(), name='index'),
        re_path(r'^(?P<year>\d{4})/game/(?P<pk>\d+)/$', views.GameView.as_view(), name='game'),
        re_path(r'^(?P<year>\d{4})/user/picks/edit/$', views.select_all, name='select_all'),
        re_path(r'^(?P<year>\d{4})/scoreboard/$', views.ScoreView.as_view(), name='scores'),
        re_path(r'^(?P<year>\d{4})/picks/$',
            views.PrettyPicksView.as_view(),
            name='picks'),
        re_path(r'^(?P<year>\d{4})/picks/editwinners/$',
            views.PrettyPicksView.as_view(),
            name='admin_pick_winners',
            kwargs={'add_winner_buttons': True}),
        re_path(r'^(?P<year>\d{4})/edit/winners/add/(?P<teamseason_id>\d+)/$',
            views.AddWinner.as_view(),
            name='add_winner'),
        re_path(r'^(?P<year>\d{4})/picks/table$', views.PicksView.as_view(), name='picks_table'),
        # re_path(r'^login/$', django.contrib.auth.views.login, name='login',
        #     kwargs={'template_name': 'pickem/registration/login.html'}),
        # re_path(r'^logout/$', django.contrib.auth.views.logout, name='logout',
        #     kwargs={'template_name': 'pickem/registration/logout.html'}),
        ]
