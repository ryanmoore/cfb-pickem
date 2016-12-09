from django.conf.urls import patterns, include, url
from django.contrib import admin
from django.conf import settings
from django.views.generic import RedirectView
from django.core.urlresolvers import reverse

admin.autodiscover()

urlpatterns = [
    # Examples:
    # url(r'^$', 'cfb_pickem.views.home', name='home'),
    # url(r'^blog/', include('blog.urls')),

    url(r'^pickem/', include('pickem.urls', namespace='pickem')),
    url(r'^admin/', include(admin.site.urls)),
    ]

if not settings.DEBUG:
    import django.views.static
    urlpatterns.append(url(r'^static/(?P<path>.*)$', django.views.static.serve, {'document_root':settings.STATIC_ROOT}))
