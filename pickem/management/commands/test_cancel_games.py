#!/usr/bin/python

import datetime
from django.contrib.auth.models import User
from django.test import TestCase
import django.utils.timezone as django_timezone
from pickem.models import (Game, Season, Wager, Event)
import pickem.management.commands.cancel_game as cmd_cancel_game


class TestCancelGameCommand(TestCase):
    @staticmethod
    def create_aware_datetime(day):
        return django_timezone.make_aware(
            datetime.datetime(2018, 12, day),
            django_timezone.get_current_timezone())

    def setUp(self):
        super().setUp()
        self.user_high_roller = User.objects.create(username='high roller')
        self.user_low_roller = User.objects.create(username='low roller')
        self.season = Season.objects.create(
            year=2018,
            start_time=django_timezone.make_aware(
                datetime.datetime(2018, 12, 26, 13, 30, 0),
                django_timezone.get_current_timezone()))
        self.event_first_responder_bowl = Event.objects.create(
            name='Servpro First Responder Bowl')
        self.event_puppy_bowl = Event.objects.create(
            name='Puppy Bowl')
        self.event_cereal_bowl = Event.objects.create(
            name='Cereal Bowl')
        self.event_championship = Event.objects.create(
            name='Championship Bowl')
        self.game_first_responder_bowl = Game.objects.create(
            event=self.event_first_responder_bowl,
            datetime=self.create_aware_datetime(27),
            season=self.season,
        )
        self.game_puppy_bowl = Game.objects.create(
            event=self.event_puppy_bowl,
            datetime=self.create_aware_datetime(28),
            season=self.season,
        )
        self.game_cereal_bowl = Game.objects.create(
            event=self.event_cereal_bowl,
            datetime=self.create_aware_datetime(29),
            season=self.season,
        )
        self.game_championship = Game.objects.create(
            event=self.event_championship,
            datetime=self.create_aware_datetime(30),
            fixed_wager_amount=4,
            season=self.season,
        )

    def test_cancel_game_by_id_aborts_if_season_does_not_match(self):
        with self.assertRaises(cmd_cancel_game.ValidationError) as cm:
            cmd_cancel_game.cancel_game_by_id(
                self.game_first_responder_bowl.id, 2000)
        self.assertEqual(
            ('Game does not match given season: 2018'
             ' (Start: 2018-12-26 18:30:00+00:00)'
             ' Servpro First Responder Bowl at Thu Dec 27 @ 12:12 AM'
             ' - '
             '2000'),
            str(cm.exception))

    def test_cancel_game_by_id(self):
        pass
