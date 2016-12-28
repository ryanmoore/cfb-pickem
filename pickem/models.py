from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from django.core.exceptions import ValidationError


class Event(models.Model):
    name = models.CharField(max_length=200, primary_key=True)

    def __str__(self):
        return self.name


class Season(models.Model):
    year = models.PositiveSmallIntegerField()
    start_time = models.DateTimeField()

    def __str__(self):
        return '{} (Start: {})'.format(self.year, self.start_time)


class Game(models.Model):
    event = models.ForeignKey(Event)
    datetime = models.DateTimeField()
    fixed_wager_amount = models.PositiveSmallIntegerField(default=0)
    season = models.ForeignKey(Season)

    def pretty_date(self):
        localtime = timezone.localtime(self.datetime)
        return localtime.strftime('%a %b %d @ %I:%m %p')

    @property
    def participants(self):
        return Participant.objects.filter(game=self)


    def __str__(self):
        return '{} {} at {}'.format(self.season, self.event, self.pretty_date())


class Team(models.Model):
    name = models.CharField(max_length=200, primary_key=True)
    site = models.CharField(max_length=200, null=True)
    #abbreviation = models.CharField(max_length=32)

    def __str__(self):
        return '{}'.format(self.name)


class TeamSeason(models.Model):
    season = models.ForeignKey(Season)
    team = models.ForeignKey(Team)
    record = models.CharField(max_length=64, null=True)
    rank = models.IntegerField(null=True)

    def __str__(self):
        rankstr = 'NR '
        if self.rank:
            rankstr = '{}. '.format(self.rank)

        return '{}{}(season={}, record={})'.format(rankstr, self.team, self.season, self.record)


class Participant(models.Model):
    game = models.ForeignKey(Game)
    teamseason = models.ForeignKey(TeamSeason)

    def __str__(self):
        return '{} in {}'.format(str(self.teamseason), str(self.game))


def game_still_undecided(participant):
    '''Confirms that the game that the participant is in does not already
    have a winner selected.
    '''
    game = Game.objects.get(participant=participant)
    game_decided = Winner.objects.filter(participant__game=game).exists()
    if game_decided:
        raise ValidationError(
            'Game(id={}) already has a winner selected.'.format(game.id))


class Winner(models.Model):
    participant = models.ForeignKey(Participant,
                                    validators=[game_still_undecided])

    def __str__(self):
        return str(self.participant)


class Selection(models.Model):
    user = models.ForeignKey(User)
    participant = models.ForeignKey(Participant)

    def __str__(self):
        return '{} picked {}'.format(self.user, self.participant)


class Wager(models.Model):
    user = models.ForeignKey(User)
    game = models.ForeignKey(Game)
    amount = models.PositiveSmallIntegerField()

    def __str__(self):
        return '{}: {} on {}'.format(self.user, self.amount, self.game)
