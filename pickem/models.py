from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone


class Event(models.Model):
    name = models.CharField(max_length=200, primary_key=True)

    def __str__(self):
        return self.name


class Game(models.Model):
    event = models.ForeignKey(Event)
    datetime = models.DateTimeField()

    unique_together = ('event', 'datetime')

    def pretty_date(self):
        localtime = timezone.localtime(self.datetime)
        return localtime.strftime('%c')

    @property
    def participants(self):
        return Participant.objects.filter(game=self)

    def __str__(self):
        return '{}'.format(str(self.event))


class Team(models.Model):
    name = models.CharField(max_length=200, primary_key=True)
    rank = models.IntegerField(null=True)
    site = models.CharField(max_length=200)
    record = models.CharField(max_length=64)
    #abbreviation = models.CharField(max_length=32)

    def __str__(self):
        return '{}'.format(self.name)


class Participant(models.Model):
    game = models.ForeignKey(Game)
    team = models.ForeignKey(Team)

    unique_together = ('game', 'team')

    def __str__(self):
        return '{} in {}'.format(str(self.team), str(self.game))


class Selection(models.Model):
    user = models.ForeignKey(User)
    participant = models.ForeignKey(Participant)

    unique_together = ('user', 'participant')

    def __str__(self):
        return


class Wager(models.Model):
    user = models.ForeignKey(User)
    game = models.ForeignKey(Game)
    amount = models.PositiveSmallIntegerField()

    unique_together = ('user', 'game')

    def __str__(self):
        return '{}: {} on {}'.format(self.user, self.wager, self.event)
