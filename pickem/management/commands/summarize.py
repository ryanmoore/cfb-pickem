''' Prints users and scores and upcoming games and wagers
'''
from django.core.management.base import BaseCommand, CommandError
#from pickem.models import Event, Game, Team, Participant
from django.db import transaction
from django.contrib.auth.models import User
import json
import logging
import datetime
import re
import itertools
from pickem.views import ScoreTable

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

class Command(BaseCommand):
    ''' Deriving as such adds __name__ as a manage.py command
    '''
    args = '<output>'
    help = 'Writes current status and future pick info to file as json'

    def __init__(self):
        super().__init__()
        self.score_table = ScoreTable(User.objects.all())

    def handle(self, *args, **options):
        ''' Main function manage calls. Reads json and adds to database
        '''
        assert len(args) == 1
        filename = args[0]

        with transaction.atomic():
            scores = self.score_table.scores_as_table()
            scores = dict([ ( str(user), score ) for user, score in scores ] )
            matchups = self.remaining_picks()
            matchup_ids = [ ( x.id, y.id ) for x,y in matchups ]
            participants = itertools.chain(*matchups)
            teams = dict( [ (part.id, part.team.name) for part in participants] )

            data = {
                    'scores': scores,
                    'matchups' : matchup_ids,
                    'teams' : teams,
                    }
            with open(filename, 'w') as outfile:
                json.dump(data, outfile, indent=4)

    def remaining_picks(self):
        games = self.score_table.unplayed_games()
        return [ game_participants(game) for game in games ]

def game_participants(game):
    return game.participant_set.all()


