from django.conf.urls import patterns, include, url


from pickem import views
urlpatterns = patterns('',
                       url(r'^$', views.IndexView.as_view(), name='index'),
                       url(r'^(?P<pk>\d+)/$', views.ContestView.as_view(), name='contest'),
                       url(r'^select/(?P<contest_id>\d+)/$', views.select, name='select'),
                       )
