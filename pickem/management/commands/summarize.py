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
from pickem.views import ScoreTable

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

class Command(BaseCommand):
    ''' Deriving as such adds __name__ as a manage.py command
    '''
    args = '<output>'
    help = 'Writes current status and future pick info to file as json'

    def handle(self, *args, **options):
        ''' Main function manage calls. Reads json and adds to database
        '''
        assert len(args) == 1
        filename = args[0]

        with transaction.atomic():
            scores = ScoreTable(User.objects.all()).scores_as_table()
            scores = dict([ ( str(user), score ) for user, score in scores ] )
            with open(filename, 'w') as outfile:
                json.dump(scores, outfile, indent=4)
