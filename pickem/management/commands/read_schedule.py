''' Reads json of games from a file and adds them to the database
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
        # Expected format for each game:
        # { 'Bowl Game' : name, 'Team 1': name, 'Team 2': name,
        #     'Network' : name, 'Time (EST)': 'hh:mm(am|pm)',
        #     'Date' : 'M dd' }
        parser.add_argument('input-json',
                             type=str,
                             help='File containing bowl data')
        parser.add_argument('start-date',
                             type=str,
                             help='Ignores all games before this .')
        parser.add_argument('season',
                             type=int,
                             help='Year for this pickem')


    def handle(self, *args, **options):
        ''' Main function manage calls. Reads json and adds to database
        '''
        with open(options['input-json'], 'r') as infile:
            data = json.load(infile)

        logging.info('Total games: {}'.format(len(data)))
        data = list(remove_earlier_games(data, options['start-date']))
        logging.info('Games after start date: {}'.format(len(data)))

        update_championship_teams(data)


        with transaction.atomic():
            season = Season.objects.get_or_create(year=options['season'])[0]
            for game in data:
                if is_championship_game(game):
                    fixed_wager_amount = len(data)-1
                else:
                    fixed_wager_amount = 0
                add_game(game, options, fixed_wager_amount, season)
        if not options['dry_run']:
            season.save()

def remove_earlier_games(data, start_date):
    for game in data:
        if not game_starts_before(game, start_date):
            yield game
        else:
            print('Skipping too early game: {}'.format(game['Bowl Game']))

def game_starts_before(game, start_date):
    start_date = datetime.datetime.strptime(start_date, '%d-%b-%Y')
    start_date = django_timezone.make_aware(start_date, django_timezone.get_current_timezone())
    kickoff = parse_datetime(game['Date'], game['Time (EST)'])
    print(kickoff)
    print(start_date)
    title = game['Bowl Game'].title()
    if kickoff is None or kickoff < start_date:
        return True

def add_game(game, options, fixed_wager_amount, season):
    ''' Parses game data from json object and adds to database
    '''
    dry_run = options['dry_run']
    start_date = options['start-date']
    start_date = datetime.datetime.strptime(start_date, '%d-%b-%Y')
    start_date = django_timezone.make_aware(start_date, django_timezone.get_current_timezone())
    kickoff = parse_datetime(game['Date'], game['Time (EST)'])
    title = game['Bowl Game'].title()
    if kickoff is None:
        logger.warning('Skipping finished game: {}'.format(title))
        return
    if kickoff < start_date:
        logger.warning('Skipping too early game: {}'.format(title))
        return
    #location = game['location']
    network = game['Network']
    teams = ( game['Team 1'], game['Team 2'] )

    logger.info('Created event: {}'.format(title))
    event = Event(name=title)
    if not dry_run:
        event.save()
    game = Game(event=event,
            season=season,
            datetime=kickoff,
            fixed_wager_amount=fixed_wager_amount)
    if not dry_run:
        game.save()
    teams = [ add_team(team) for team in teams ]
    for team in teams:
        if not dry_run:
            team.save()
    teamseasons = [TeamSeason(team=team, season=season) for team in teams]
    for teamseason in teamseasons:
        if not dry_run:
            teamseason.save()
    parts = [Participant(game=game,
                         teamseason=teamseason) for teamseason in teamseasons]
    for part in parts:
        if not dry_run:
            part.save()

def parse_datetime(date, time):
    '''Decodes the expected datetime string into a datetime object
    '''
    #date_format = '%b. %d, %Y | %I:%M %p %Z'
    date_format = '%b. %d %I:%M%p'
    kickoff = '{} {}'.format(date, time)
    result = datetime.datetime.strptime(kickoff, date_format)
    if result.month == 12:
        result = result.replace(year=2015)
    else:
        result = result.replace(year=2016)
    return django_timezone.make_aware(result,
                                      django_timezone.get_current_timezone())

def add_team(team):
    '''Decodes team dict to make team objects
    '''
    return Team(name=team,
            #rank=None, # team.get('rank', None),
            site=None, # team['link'],
            #record=None # team['record'],
            )


def find_playoff_teams(data):
    teams = []
    for game in data:
        if not is_semifinal_game(game):
            continue
        teams.append('{}/{}'.format(game['Team 1'], game['Team 2']))
    return teams

def is_championship_game(game):
    return game.get('Championship', False)

def is_semifinal_game(game):
    return game.get('Playoff', False)

def update_championship_teams(data):
    playoff_teams = find_playoff_teams(data)
    print('Found playoff teams: {}'.format(str(playoff_teams)))
    for game in data:
        if is_championship_game(game):
            print('Registering playoff teams for: {}'.format(game['Bowl Game']))
            assert game['Team 1'] == ''
            game['Team 1'] = playoff_teams[0]
            assert game['Team 2'] == ''
            game['Team 2'] = playoff_teams[1]
