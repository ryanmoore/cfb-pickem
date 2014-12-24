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
from optparse import make_option

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

class Command(BaseCommand):
    ''' Deriving as such adds __name__ as a manage.py command
    '''
    args = '<source>'
    help = ' Reads json of games from a file and adds them to the database'
    option_list = BaseCommand.option_list + (
            make_option('--dry-run',
                action='store_true',
                dest='dry_run',
                default=False,
                help='Do not actually do the modifications'),
            make_option('--start-date',
                type=str,
                dest='start_date',
                default=datetime.date.today().strftime('%d-%b-%Y'),
                help='Ignores all games before this date'),
            )


    def handle(self, *args, **options):
        ''' Main function manage calls. Reads json and adds to database
        '''
        assert len(args) == 1
        filename = args[0]
        with open(filename, 'r') as infile:
            data = json.load(infile)

        update_championship_teams(data)

        data = list(remove_earlier_games(data, options['start_date']))

        with transaction.atomic():
            for game in data:
                if is_championship_game(game):
                    fixed_wager_amount = len(data)-1
                else:
                    fixed_wager_amount = 0
                add_game(game, options, fixed_wager_amount)

def remove_earlier_games(data, start_date):
    for game in data:
        if not game_starts_before(game, start_date):
            yield game
        else:
            print('Skipping too early game: {}'.format(game['title']))

def game_starts_before(game, start_date):
    start_date = datetime.datetime.strptime(start_date, '%d-%b-%Y')
    start_date = django_timezone.make_aware(start_date, django_timezone.get_current_timezone())
    kickoff = parse_datetime(game['datetime'])
    title = game['title'].title()
    if kickoff is None or kickoff < start_date:
        return True

def add_game(game, options, fixed_wager_amount):
    ''' Parses game data from json object and adds to database
    '''
    dry_run = options['dry_run']
    start_date = options['start_date']
    start_date = datetime.datetime.strptime(start_date, '%d-%b-%Y')
    start_date = django_timezone.make_aware(start_date, django_timezone.get_current_timezone())
    kickoff = parse_datetime(game['datetime'])
    title = game['title'].title()
    if kickoff is None:
        logger.warning('Skipping finished game: {}'.format(title))
        return
    if kickoff < start_date:
        logger.warning('Skipping too early game: {}'.format(title))
        return
    location = game['location']
    network = game['network']
    teams = ( game['teamA'], game['teamB'] )

    logger.info('Created event: {}'.format(title))
    event = Event(name=title)
    if not dry_run:
        event.save()
    game = Game(event=event,
            datetime=kickoff,
            fixed_wager_amount=fixed_wager_amount)
    if not dry_run:
        game.save()
    teams = [ add_team(team) for team in teams ]
    for team in teams:
        if not dry_run:
            team.save()
    parts = [ Participant(game=game, team=team) for team in teams ]
    for part in parts:
        if not dry_run:
            part.save()

def parse_datetime(kickoff):
    '''Decodes the expected datetime string into a datetime object
    '''
    if 'final' in kickoff.lower():
        return None
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


def find_playoff_teams(data):
    teams = []
    for game in data:
        if not is_semifinal_game(game):
            continue
        teams.append('{}/{}'.format(game['teamA']['name'], game['teamB']['name']))
    return teams

def is_championship_game(game):
    return 'championship' in game['title'].lower()

def is_semifinal_game(game):
    return 'semifinal' in game['title'].lower()

def update_championship_teams(data):
    playoff_teams = find_playoff_teams(data)
    print('Found playoff teams: {}'.format(str(playoff_teams)))
    for game in data:
        if is_championship_game(game):
            print('Registering playoff teams for: {}'.format(game['title']))
            assert game['teamA']['name'] == 'TBD'
            game['teamA']['name'] = playoff_teams[0]
            assert game['teamB']['name'] == 'TBD'
            game['teamB']['name'] = playoff_teams[1]
