from django.contrib import admin
from pickem.models import Contest, Team, Selection

class TeamInline(admin.StackedInline):
    model = Team
    extra = 2
    max_num = 2

class ContestAdmin(admin.ModelAdmin):
    fieldsets = [
        (None, {'fields':['name']}),
        ('Date information', {'fields':['date']}),
    ]
    inlines = [TeamInline]
    list_display = ['name', 'date']

class SelectionAdmin(admin.ModelAdmin):
    list_display = ['contest', 'team', 'wager']

admin.site.register(Contest, ContestAdmin)
admin.site.register(Selection, SelectionAdmin)
