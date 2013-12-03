from django.conf.urls import patterns, url
import django.contrib.auth.views

from pickem import views
urlpatterns = patterns('',
                       url(r'^$', views.IndexView.as_view(), name='index'),
                       url(r'^game/(?P<pk>\d+)/$', views.GameView.as_view(), name='game'),
                       url(r'^user/picks/edit/$', views.select_all, name='select_all'),
                       url(r'^login/$', django.contrib.auth.views.login, name='login',
                           kwargs={'template_name': 'pickem/registration/login.html'})
                       #url(r'^select/(?P<contest_id>\d+)/$', views.select, name='select'),
                       #url(r'^select_all/$', views.select_all, name='select_all'),
                       #url(r'^select_all_sortable/$', views.select_all_sortable, name='select_all_sortable')
)

