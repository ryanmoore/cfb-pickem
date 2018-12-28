#!/usr/bin/python

import logging
from django.core.management.base import BaseCommand, CommandError
from pickem.models import (Game, Season, Wager)

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

class Command(BaseCommand):
    ''' Deriving as such adds __name__ as a manage.py command
    '''
    help = ('Removes a game from the given season and adjusts all wager'
            ' values shifting down any wager of a higher value by one')

    def add_arguments(self, parser):
        parser.add_argument(
            'season', type=int,
            help='Season in which to cancel the game')
        parser.add_argument(
            'game', type=int,
            help='id of the game to cancel')

    def handle(self, *args, **options):
        ''' Main function manage calls. Reads json and adds to database
        '''
        season = options['season']
        game_id = options['game']

        with transaction.atomic():
            cancel_game_by_id(game_id, season_check=season)

class ValidationError(Exception):
    pass

def cancel_game_by_id(game_id, season_check=None):
    game_to_cancel = Game.objects.get(id=game_id)
    if season_check and game_to_cancel.season.year != season_check:
        raise ValidationError(
            'Game does not match given season: {} - {}'.format(
            game_to_cancel, season_check))
