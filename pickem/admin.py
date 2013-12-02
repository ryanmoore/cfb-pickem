from django.contrib import admin
from pickem.models import Event, Game, Team, Participant


class EventAdmin(admin.ModelAdmin):
    model = Event


class GameAdmin(admin.ModelAdmin):
    model = Game
    list_display = ['event', 'pretty_date']


class TeamAdmin(admin.ModelAdmin):
    model = Team


class ParticipantAdmin(admin.ModelAdmin):
    model = Participant
    list_display = ['team', 'game']


admin.site.register(Event, EventAdmin)
admin.site.register(Game, GameAdmin)
admin.site.register(Team, TeamAdmin)
admin.site.register(Participant, ParticipantAdmin)

