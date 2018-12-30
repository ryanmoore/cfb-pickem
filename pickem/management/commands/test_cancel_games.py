#!/usr/bin/python

import datetime
from django.contrib.auth.models import User
from django.test import TestCase
import django.utils.timezone as django_timezone
from pickem.models import (Game, Season, Wager, Event)
import pickem.management.commands.cancel_game as cmd_cancel_game


class TestCancelGameCommand(TestCase):
    @staticmethod
    def create_aware_datetime(day, year=2018):
        return django_timezone.make_aware(
            datetime.datetime(year, 12, day),
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
            fixed_wager_amount=3,
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

    def test_shift_wagers_over_deleted_shifts_down_greater(self):
        wagers = [
            Wager(user=self.user_high_roller,
                  game=self.game_first_responder_bowl,
                  amount=3),
            Wager(user=self.user_high_roller,
                  game=self.game_puppy_bowl,
                  amount=4),
        ]
        for wager in wagers:
            wager.save()
        cmd_cancel_game.shift_wagers_over_deleted(wagers[0])
        puppy_wager = Wager.objects.get(id=wagers[1].id)
        wager_to_delete = Wager.objects.get(id=wagers[0].id)
        self.assertEqual(
            3, puppy_wager.amount,
            'The other wager with the greater amount should be shifted down')
        self.assertEqual(
            3, wager_to_delete.amount,
            'The wager to delete\'s amount should be unchanged')

    def test_shift_wagers_over_deleted_preserves_lower_amounts(self):
        wagers = [
            Wager(user=self.user_high_roller,
                  game=self.game_first_responder_bowl,
                  amount=3),
            Wager(user=self.user_high_roller,
                  game=self.game_puppy_bowl,
                  amount=2),
        ]
        for wager in wagers:
            wager.save()
        cmd_cancel_game.shift_wagers_over_deleted(wagers[0])
        puppy_wager = Wager.objects.get(id=wagers[1].id)
        wager_to_delete = Wager.objects.get(id=wagers[0].id)
        self.assertEqual(
            2, puppy_wager.amount,
            'The other wager with the lesser amount should be unchanged')
        self.assertEqual(
            3, wager_to_delete.amount,
            'The wager to delete\'s amount should be unchanged')

    def test_shift_wagers_over_deleted_does_not_affect_other_users(self):
        wagers = [
            Wager(user=self.user_high_roller,
                  game=self.game_first_responder_bowl,
                  amount=3),
            Wager(user=self.user_low_roller,
                  game=self.game_puppy_bowl,
                  amount=4),
        ]
        for wager in wagers:
            wager.save()
        cmd_cancel_game.shift_wagers_over_deleted(wagers[0])
        puppy_wager = Wager.objects.get(id=wagers[1].id)
        wager_to_delete = Wager.objects.get(id=wagers[0].id)
        self.assertEqual(
            4, puppy_wager.amount,
            'The wager by the other user should be unchanged')
        self.assertEqual(
            3, wager_to_delete.amount,
            'The wager to delete\'s amount should be unchanged')

    def test_shift_wagers_over_deleted_does_not_affect_other_seasons(self):
        another_season = Season.objects.create(
            year=1800, start_time=self.create_aware_datetime(25, year=1800))
        another_season.save()
        game_from_another_season = Game.objects.create(
            event=self.event_first_responder_bowl,
            datetime=self.create_aware_datetime(27, year=1800),
            season=another_season)
        game_from_another_season.save()

        wagers = [
            Wager(user=self.user_high_roller,
                  game=self.game_first_responder_bowl,
                  amount=3),
            Wager(user=self.user_high_roller,
                  game=game_from_another_season,
                  amount=4),
        ]
        for wager in wagers:
            wager.save()
        cmd_cancel_game.shift_wagers_over_deleted(wagers[0])
        puppy_wager = Wager.objects.get(id=wagers[1].id)
        wager_to_delete = Wager.objects.get(id=wagers[0].id)
        self.assertEqual(
            4, puppy_wager.amount,
            'The wager by the same user in another season should be unchanged')
        self.assertEqual(
            3, wager_to_delete.amount,
            'The wager to delete\'s amount should be unchanged')

    def test_cancel_game_by_id(self):
        wagers = [
            Wager(user=self.user_high_roller,
                  game=self.game_cereal_bowl,
                  amount=1),
            Wager(user=self.user_high_roller,
                  game=self.game_puppy_bowl,
                  amount=2),
            Wager(user=self.user_high_roller,
                  game=self.game_first_responder_bowl,
                  amount=3),
            Wager(user=self.user_high_roller,
                  game=self.game_championship,
                  amount=3),
            Wager(user=self.user_low_roller,
                  game=self.game_cereal_bowl,
                  amount=1),
            Wager(user=self.user_low_roller,
                  game=self.game_first_responder_bowl,
                  amount=2),
            Wager(user=self.user_low_roller,
                  game=self.game_puppy_bowl,
                  amount=3),
            Wager(user=self.user_low_roller,
                  game=self.game_championship,
                  amount=3),
        ]
        for wager in wagers:
            wager.save()
        cmd_cancel_game.cancel_game_by_id(self.game_first_responder_bowl.id)
        puppy_wager = Wager.objects.get(id=wagers[1].id)
        expected_wagers = [
            (self.user_high_roller, self.game_cereal_bowl, 1),
            (self.user_high_roller, self.game_puppy_bowl, 2),
            (self.user_high_roller, self.game_championship, 2),
            (self.user_low_roller, self.game_cereal_bowl, 1),
            (self.user_low_roller, self.game_puppy_bowl, 2),
            (self.user_low_roller, self.game_championship, 2),
        ]
        for expected_wager in expected_wagers:
            user, game, expected_amount = expected_wager
            matching_wagers = Wager.objects.filter(
                user=user, game=game).all()
            self.assertEqual(1, len(matching_wagers),
                             'Expect one wager per user per game')
            actual, = matching_wagers
            self.assertEqual(
                expected_amount, actual.amount,
                'Modified wager for {} does not match expected'.format(
                    actual.game))

        championship = Game.objects.get(id=self.game_championship.id)
        self.assertEqual(
            2, championship.fixed_wager_amount,
            'Championship game\'s fixed wager not updated correctly')
