''' Reads json of games from a file and updates the kickoff time of any
matching games in the database. Expected format for each game:
    {
        'Bowl Game' : name,
        'Team 1': name,
        'Team 2': name,
        'Network' : name,
        'Date': '<date and time>',
        'DateFormat' : '<format of above date>'
    }

'''
from django.core.management.base import BaseCommand, CommandError
from pickem.models import Event, Game, Team, Participant, Season, TeamSeason
from django.db import transaction
import django.utils.dateparse as django_dateparse
import django.utils.timezone as django_timezone
import json
import logging
import datetime
import re
import sys
from optparse import make_option

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

class Command(BaseCommand):
    ''' Deriving as such adds __name__ as a manage.py command
    '''
    help = ' Reads json of games from a file and adds them to the database'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help='Walk through data and do all actions except commit')
        parser.add_argument('input-json',
                             type=str,
                             help='File containing bowl data')
        parser.add_argument('season',
                             type=int,
                             help='Year for this pickem')

    def handle(self, *args, **options):
        ''' Main function manage calls. Reads json and adds to database
        '''
        with open(options['input-json'], 'r') as infile:
            data = json.load(infile)

        logging.info('Total games: {}'.format(len(data)))

        with transaction.atomic():
            season = Season.objects.get(year=options['season'])
            games = Game.objects.filter(season=season)
            logging.info("Found {} games for this season".format(len(games)))
            for game in games:
                for game_info in data:
                    if game.event.name == game_info["Bowl Game"]:
                        old_start = game.datetime
                        kickoff = parse_datetime(game_info)
                        logging.info("Updating start for {} to {}. Previously {}".format(
                            game.event.name, kickoff, old_start))
                        game.datetime = kickoff
                        if not options['dry_run']:
                            game.save()
                        break
                else:
                    logging.warning("Failed to find start for {}".format(game.event.name))


def parse_datetime(game):
    '''Decodes the expected datetime string into a datetime object
    '''
    result = datetime.datetime.strptime(game['Date'], game['DateFormat'])
    if result.tzinfo is None:
        logging.error("Please add timezones to the provided dates so we don't"
                      " have a repeat of Dec 2021's ridiculous start times"
                      " and mountain time, eastern time, central time, utc"
                      " debacle.")
        logging.error("Game: {}".format(game))
        logging.error("Result: {}".format(result))
        sys.exit(1)
    return result
