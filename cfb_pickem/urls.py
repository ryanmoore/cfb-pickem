from django.conf.urls import patterns, include, url
from django.contrib import admin
from django.conf import settings
from django.views.generic import RedirectView
from django.core.urlresolvers import reverse

from rest_framework import routers
from pickem import views

router = routers.DefaultRouter()
router.register(r'users', views.UserViewSet)
router.register(r'groups', views.GroupViewSet)
router.register(r'events', views.EventViewSet)
router.register(r'seasons', views.SeasonViewSet)
router.register(r'games', views.GameViewSet, base_name='game')
router.register(r'teams', views.TeamViewSet)
router.register(r'teamseasons', views.TeamSeasonViewSet)
router.register(r'participants', views.ParticipantViewSet)
router.register(r'winners', views.WinnerViewSet)
router.register(r'selections', views.SelectionViewSet, base_name='selection')
router.register(r'wagers', views.WagerViewSet)
router.register(r'progress/(?P<season>\d+)', views.ProgressViewSet, base_name='progress')


admin.autodiscover()

urlpatterns = [
    # Examples:
    # url(r'^$', 'cfb_pickem.views.home', name='home'),
    # url(r'^blog/', include('blog.urls')),

    url(r'^pickem/', include('pickem.urls', namespace='pickem')),
    url(r'^admin/', include(admin.site.urls)),
    url(r'^api/', include(router.urls)),
    url(r'^api/makepicks/', views.MakePicksView.as_view()),
    url(r'^api/auth/', include('knox.urls')),
    ]

if not settings.DEBUG:
    import django.views.static
    urlpatterns.append(url(r'^static/(?P<path>.*)$', django.views.static.serve, {'document_root':settings.STATIC_ROOT}))
