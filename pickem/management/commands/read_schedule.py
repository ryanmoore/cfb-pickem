''' Reads json of games from a file and adds them to the database
'''
from django.core.management.base import BaseCommand, CommandError
from pickem.models import Event, Game, Team, Participant
from django.db import transaction
import django.utils.timezone as django_timezone
import json
import logging
import datetime
import re

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

class Command(BaseCommand):
    ''' Deriving as such adds __name__ as a manage.py command
    '''
    args = '<source>'
    help = ' Reads json of games from a file and adds them to the database'

    def handle(self, *args, **options):
        ''' Main function manage calls. Reads json and adds to database
        '''
        assert len(args) == 1
        filename = args[0]
        with open(filename, 'r') as infile:
            data = json.load(infile)

        with transaction.atomic():
            for game in data:
                add_game(game)

def add_game(game):
    ''' Parses game data from json object and adds to database
    '''
    kickoff = parse_datetime(game['datetime'])
    location = game['location']
    network = game['network']
    title = game['title'].title()
    teams = ( game['teamA'], game['teamB'] )

    logger.info('Created event: {}'.format(title))
    event = Event(name=title)
    event.save()
    game = Game(event=event, datetime=kickoff)
    game.save()
    teams = [ add_team(team) for team in teams ]
    for team in teams:
        team.save()
    parts = [ Participant(game=game, team=team) for team in teams ]
    for part in parts:
        part.save()

def parse_datetime(kickoff):
    '''Decodes the expected datetime string into a datetime object
    '''
    date_format = '%b. %d, %Y | %I:%M %p %Z'
    kickoff = re.sub(r'ET', r'EST', kickoff)
    result = datetime.datetime.strptime(kickoff, date_format)
    return django_timezone.make_aware(result, django_timezone.get_current_timezone())

def add_team(team):
    '''Decodes team dict to make team objects
    '''
    return Team(name=team['name'],
            rank=team.get('rank', None),
            site=team['link'],
            record=team['record'],
            )
