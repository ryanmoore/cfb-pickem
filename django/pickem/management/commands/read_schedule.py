''' Reads json of games from a file and adds them to the database
Expected format for each game:
    {
        'Bowl Game' : name,
        'Team 1': name,
        'Team 2': name,
        'Network' : name,
        'Time (EST)': 'hh:mm(am|pm)',
        'Date' : 'M dd'
    }

Optional fields are "Championship" which if true indicates the game is the
final one and "Playoff" which if true indicates the game is one of the two
semi-final games
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
        parser.add_argument('input-json',
                             type=str,
                             help='File containing bowl data')
        parser.add_argument('season',
                             type=int,
                             help='Year for this pickem')
        parser.add_argument(
            '--start-date',
            help=('Ignores all games before this date: DAY-MONTH-YEAR'
                  ' (e.g. 26-dec-2017). Default is first upcoming'
                  ' game\'s kickoff'))


    def handle(self, *args, **options):
        ''' Main function manage calls. Reads json and adds to database
        '''
        with open(options['input-json'], 'r') as infile:
            data = json.load(infile)

        logging.info('Total games: {}'.format(len(data)))
        if not options.get('start_date'):
            start_date = nearest_kickoff_time(data)
            logging.info('Using start time of %s', start_date)
        else:
            start_date = parse_start_time(options['start_date'])
        data = list(remove_earlier_games(data, start_date))
        logging.info('Games after start date: {}'.format(len(data)))

        update_championship_teams(data)


        with transaction.atomic():
            season = Season.objects.get_or_create(
                year=options['season'],
                defaults={'start_time': start_date})[0]
            for game in data:
                if is_championship_game(game):
                    fixed_wager_amount = len(data)-1
                else:
                    fixed_wager_amount = 0
                add_game(game, options, fixed_wager_amount, season, start_date)
        if not options['dry_run']:
            season.save()


def remove_earlier_games(data, start_date):
    for game in data:
        if not game_starts_before(game, start_date):
            yield game
        else:
            print('Skipping too early game: {}'.format(game['Bowl Game']))


def parse_start_time(start_time):
    start_date = datetime.datetime.strptime(start_time, '%d-%b-%Y')
    start_date = django_timezone.make_aware(start_date, django_timezone.get_current_timezone())
    return start_date


def game_starts_before(game, start_date):
    kickoff = parse_datetime(game)
    title = game['Bowl Game'].title()
    if kickoff is None or kickoff < start_date:
        return True


def nearest_kickoff_time(games):
    """Returns the datetime of the first kickoff time after now
    :param list games: List of game dictionaries
    """
    now = django_timezone.make_aware(datetime.datetime.now(), django_timezone.get_current_timezone())
    nearest = None
    for game in games:
        kickoff = parse_datetime(game)
        if kickoff > now and not nearest:
            nearest = kickoff
        elif kickoff > now and kickoff < nearest:
            nearest = kickoff
    return nearest


def add_game(game, options, fixed_wager_amount, season, start_date):
    ''' Parses game data from json object and adds to database
    '''
    dry_run = options['dry_run']
    kickoff = parse_datetime(game)
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
            if game.get('Team 1'):
                logger.warn(
                    'Champtionship game has team listed. Ignoring: %s. Using: %s',
                    game.get('Team 1'), playoff_teams[0])
            if game.get('Team 2'):
                logger.warn(
                    'Champtionship game has team listed. Ignoring: %s. Using: %s',
                    game.get('Team 2'), playoff_teams[1])
            game['Team 1'] = playoff_teams[0]
            game['Team 2'] = playoff_teams[1]
