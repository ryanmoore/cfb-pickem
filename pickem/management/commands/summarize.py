''' Prints users and scores and upcoming games and wagers
'''
from django.core.management.base import BaseCommand, CommandError
from pickem.models import Wager, Selection
from django.db import transaction
from django.contrib.auth.models import User
import json
import logging
import datetime
import re
import itertools
import sys
from pickem.views import ScoreTable
from pickem.models import Season

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

class Command(BaseCommand):
    ''' Deriving as such adds __name__ as a manage.py command
    '''
    help = 'Writes current status and future pick info to file as json'

    def add_arguments(self, parser):
        parser.add_argument('season', type=int, help='Season to summarize')
        parser.add_argument('output',
                            type=str,
                            help='File to write resulting JSON')

    def __init__(self):
        super().__init__()

    def handle(self, *args, **options):
        ''' Main function manage calls. Reads json and adds to database
        '''
        self.score_table = ScoreTable(User.objects.all(),
                                      Season.objects.get(
                                          year=options['season']))
        filename = options['output']

        with transaction.atomic():
            scores = self.score_table.scores_as_table()
            scores = dict([ ( user.id, score ) for user, score in scores ] )
            users = dict([ (user.id, str(user)) for user in User.objects.all() ])
            matchups = self.remaining_matchups()
            matchup_ids = [ ( x.id, y.id ) for x,y in matchups ]
            participants = list(itertools.chain(*matchups))
            teams = dict([(part.id, part.teamseason.team.name)
                          for part in participants])
            picks = list(self.get_picks(participants))
            data = {
                    'users' : users,
                    'scores': scores,
                    'matchups' : matchup_ids,
                    'teams' : teams,
                    'picks' : picks,
                    }
            with open(filename, 'w') as outfile:
                json.dump(data, outfile, indent=4)
            sys.stdout.write(self.style.SUCCESS('Wrote {}.\n'.format(filename)))

    def remaining_matchups(self):
        games = self.score_table.unplayed_games()
        return [ game_participants(game) for game in games ]

    def get_picks(self, participants):
        wagers = Wager.objects.filter(game__in=self.score_table.unplayed_games())
        for w in wagers:
            try:
                amount = w.amount
                part = Selection.objects.get(user=w.user, participant__game=w.game).participant
            except Selection.DoesNotExist:
                amount = 0
                part = list(w.game.participant_set.all())[0]
            yield (
                    { 'user': w.user.id,
                      'wager' : amount,
                      'team' : part.id,
                      }
                )

def game_participants(game):
    return game.participant_set.all()
