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


def shift_wagers_over_deleted(wager):
    """Changes all wagers that are in the same season with wager amounts
    greater than the given wager to have a wager amount that is one less
    :param Wager wager: the wager that will be deleted
    """
    wagers_to_adjust = Wager.objects.filter(
        user=wager.user,
        game__season=wager.game.season,
        amount__gte=wager.amount)\
        .exclude(game=wager.game).all()
    for wager in wagers_to_adjust:
        wager.amount -= 1
        wager.save()


def cancel_game_by_id(game_id, season_check=None):
    """Cancels the given game for all users adjusting any wager greater
    than the given one down and updating the fixed_wager_amount to be
    the new max
    :param int game_id: id of the game to cancel
    :param int season_check: if provided, assert the game is in this year
    """
    game_to_cancel = Game.objects.get(id=game_id)
    if season_check and game_to_cancel.season.year != season_check:
        raise ValidationError(
            'Game does not match given season: {} - {}'.format(
            game_to_cancel, season_check))
    wagers_to_delete = Wager.objects.filter(game=game_to_cancel).all()
    for wager in wagers_to_delete:
        shift_wagers_over_deleted(wager)
        wager.delete()
    fixed_wager_games = Game.objects.filter(
        fixed_wager_amount__gt=0).all()
    for game in fixed_wager_games:
        game.fixed_wager_amount -= 1
        game.save()
    game_to_cancel.delete()
