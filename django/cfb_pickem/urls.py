from django.urls import include, re_path
from django.contrib import admin
from django.conf import settings
from django.views.generic import RedirectView

from rest_framework import routers
from pickem import views
from knox import views as knox_views

router = routers.DefaultRouter()
router.register(r'users', views.UserViewSet)
router.register(r'groups', views.GroupViewSet)
router.register(r'events', views.EventViewSet)
router.register(r'seasons', views.SeasonViewSet)
router.register(r'games', views.GameViewSet, basename='game')
router.register(r'teams', views.TeamViewSet)
router.register(r'teamseasons', views.TeamSeasonViewSet)
router.register(r'participants', views.ParticipantViewSet)
router.register(r'winners', views.WinnerViewSet)
router.register(r'selections', views.SelectionViewSet, basename='selection')
router.register(r'wagers', views.WagerViewSet)
router.register(r'progress/(?P<season>\d+)', views.ProgressViewSet, basename='progress')


admin.autodiscover()

urlpatterns = [
    re_path(r'^pickem/', include(('pickem.urls', 'pickem'), namespace="pickem")),
    re_path(r'^admin/', admin.site.urls),
    re_path(r'^api/', include(router.urls)),
    re_path(r'^api/makepicks/', views.MakePicksView.as_view()),
    re_path(r'^api/auth/login/', views.LoginView.as_view(), name='knox_login'),
    re_path(r'^api/auth/logout/', knox_views.LogoutView.as_view(), name='knox_logout'),
    re_path(r'^api/auth/logoutall/', knox_views.LogoutAllView.as_view(), name='knox_logoutall'),
]

if not settings.DEBUG:
    import django.views.static
    urlpatterns.append(re_path(r'^static/(?P<path>.*)$', django.views.static.serve, {'document_root':settings.STATIC_ROOT}))
