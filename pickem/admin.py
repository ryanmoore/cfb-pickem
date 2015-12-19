from django.contrib import admin
from pickem.models import Event, Game, Team, Participant, Winner

# pylint: disable=too-many-public-methods

class EventAdmin(admin.ModelAdmin):
    model = Event

class ParticipantInline(admin.StackedInline):
    model = Participant
    max_num = 2

class GameAdmin(admin.ModelAdmin):
    model = Game
    list_display = ['event', 'pretty_date']
    inlines = [ ParticipantInline ]

class TeamAdmin(admin.ModelAdmin):
    model = Team


class ParticipantAdmin(admin.ModelAdmin):
    model = Participant
    list_display = ['teamseason', 'game']

class WinnerAdmin(admin.ModelAdmin):
    model = Winner


admin.site.register(Event, EventAdmin)
admin.site.register(Game, GameAdmin)
admin.site.register(Team, TeamAdmin)
admin.site.register(Participant, ParticipantAdmin)
admin.site.register(Winner, WinnerAdmin)

