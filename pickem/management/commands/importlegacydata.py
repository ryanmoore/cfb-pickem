#!/usr/bin/python
"""
    Created by: Ryan Moore
    Contact   : ryanmoore88@gmail.com
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from pickem.models import (Season, Team, TeamSeason, Game, Event, Participant,
                           Winner, Selection, Wager)
from django.contrib.auth.models import User
import json
import datetime
import sys
from django.utils.dateparse import parse_datetime


class Command(BaseCommand):
    help = 'Closes the specified poll for voting'

    def add_arguments(self, parser):
        parser.add_argument('dataset',
                            type=str,
                            help='json file containing a previous year\'s data')
        parser.add_argument('year',
                            type=str,
                            help='year/season under which to file the data')
        parser.add_argument(
            'usermap',
            type=str,
            help='A json file mapping usernames from old -> existing')

    def read_data(self, fname):
        with open(fname, 'r') as infile:
            return json.load(infile)

    def read_usermap(self, fname):
        with open(fname, 'r') as infile:
            self.usernames = json.load(infile)

    def get_user(self, username):
        return User.objects.get(username=self.usernames[username])

    def create_season(self, season):
        return Season.objects.get_or_create(year=season)

    def handle(self, *args, **options):
        self.dataset = self.read_data(options['dataset'])
        self.usermap = self.read_usermap(options['usermap'])
        self.game_from_pk = {}
        self.participant_from_pk = {}
        self.winner_from_pk = {}
        self.user_from_pk = {}
        self.selection_from_pk = {}
        with transaction.atomic():
            self.season, new_season = self.create_season(options['year'])
            for entry in self.dataset:
                self.handle_entry(entry)
        sys.stdout.write(self.style.SUCCESS('Data import successful.'))
        return

    def handle_entry(self, entry):
        handlers = {'contenttypes.contenttype': self.ignore,
                    'sessions.session': self.ignore,
                    'auth.permission': self.ignore,
                    'admin.logentry': self.ignore,
                    'pickem.event': self.handle_event,
                    'pickem.game': self.handle_game,
                    'pickem.team': self.handle_team,
                    'pickem.participant': self.handle_participant,
                    'pickem.winner': self.handle_winner,
                    'auth.user': self.handle_user,
                    'pickem.selection': self.handle_selection,
                    'pickem.wager': self.handle_wager}
        handlers[entry['model']](entry)

    def ignore(self, entry):
        return

    def handle_event(self, entry):
        Event.objects.create(name=entry['pk'])

    def handle_game(self, entry):
        event = Event.objects.get(name=entry['fields']['event'])
        dt = parse_datetime(entry['fields']['datetime'])
        fixed_wager = entry['fields'].get('fixed_wager_amount', 0)
        pk = entry['pk']
        game = Game.objects.create(event=event,
                                   datetime=dt,
                                   fixed_wager_amount=fixed_wager,
                                   season=self.season)
        self.game_from_pk[pk] = game


    def handle_team(self, entry):
        name = entry['pk']
        site = entry['fields']['site']
        record = entry['fields']['record']
        rank = entry['fields']['rank']
        team = Team.objects.get_or_create(name=name, site=site)[0]
        teamseason = TeamSeason.objects.get_or_create(team=team,
                                                      season=self.season,
                                                      record=record,
                                                      rank=rank)

    def handle_participant(self, entry):
        team = Team.objects.get(name=entry['fields']['team'])
        teamseason = TeamSeason.objects.get(team=team, season=self.season)
        game = self.game_from_pk[entry['fields']['game']]
        participant = Participant.objects.create(game=game,
                                                 teamseason=teamseason)
        self.participant_from_pk[entry['pk']] = participant

    def handle_winner(self, entry):
        participant = self.participant_from_pk[entry['fields']['participant']]
        winner = Winner.objects.create(participant=participant)
        self.winner_from_pk[entry['pk']] = winner

    def handle_user(self, entry):
        user = self.get_user(entry['fields']['username'])
        self.user_from_pk[entry['pk']] = user

    def handle_selection(self, entry):
        user = self.user_from_pk[entry['fields']['user']]
        participant = self.participant_from_pk[entry['fields']['participant']]
        selection = Selection.objects.create(user=user, participant=participant)
        self.selection_from_pk[entry['pk']] = selection

    def handle_wager(self, entry):
        user = self.user_from_pk[entry['fields']['user']]
        game = self.game_from_pk[entry['fields']['game']]
        amount = entry['fields']['amount']
        Wager.objects.create(user=user, game=game, amount=amount)
