'''
from pickem import views
urlpatterns = patterns('',
                       url(r'^$', views.IndexView.as_view(), name='index'),
                       url(r'^(?P<pk>\d+)/$', views.ContestView.as_view(), name='contest'),
                       url(r'^select/(?P<contest_id>\d+)/$', views.select, name='select'),
                       url(r'^select_all/$', views.select_all, name='select_all'),
                       url(r'^select_all_sortable/$', views.select_all_sortable, name='select_all_sortable')
                       )
'''
