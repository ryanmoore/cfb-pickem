from django.test import TestCase
from pickem.models import Game, Selection, Participant, Wager, Winner
from django.contrib.auth.models import User
import django.utils.timezone as timezone
from django.conf import settings

import pickem.views as views
import datetime

# Create your tests here.

class MissingCalculationTests(TestCase):
    def setUp(self):
        self.userA = User.objects.create(username='bob')
        self.userB = User.objects.create(username='alice')
        self.picks = []
        self.games = []
        for i in range(0, 12):
            self.games.append(Game.objects.create(event_id=i,
                datetime=timezone.now()))


    def make_picks(self, user, count):
        self.picks = []
        for i in range(0, count):
            self.picks.append(Selection.objects.create(user=user,
                participant_id=i))

    def tearDown(self):
        self.userA.delete()
        self.userB.delete()
        for pick in self.picks:
            pick.delete()
        for pick in self.games:
            pick.delete()

    def test_missing_count_all_missing_solo(self):
        '''If no one has any picks, everyone is missing all games
        '''
        count = views.num_missing_picks_user(self.userA)
        self.assertEqual(count, len(self.games))
        count = views.num_missing_picks_user(self.userB)
        self.assertEqual(count, len(self.games))

    def test_missing_count_none_missing_solo(self):
        '''If a user makes a pick for every game, missing count is 0
        '''
        self.make_picks(self.userA, len(self.games))
        count = views.num_missing_picks_user(self.userA)
        self.assertEqual(count, 0)

    def test_missing_count_some_missing_solo(self):
        '''If a user makes a pick for half the games, missing count is
        the other half
        '''
        self.make_picks(self.userA, int(len(self.games)/2))
        count = views.num_missing_picks_user(self.userA)
        self.assertEqual(count, int(len(self.games)/2))

    def test_missing_count_all_missing_pair(self):
        '''If userB makes picks for games but none for userA, userA missing
        count is all games
        '''
        self.make_picks(self.userB, int(len(self.games)/2))
        count = views.num_missing_picks_user(self.userA)
        self.assertEqual(count, len(self.games))

    def test_missing_count_none_missing_pair(self):
        '''If userB makes picks for games but userA makes for all, userA
        missing count is 0
        '''
        self.make_picks(self.userB, int(len(self.games)/2))
        self.make_picks(self.userA, len(self.games))
        count = views.num_missing_picks_user(self.userA)
        self.assertEqual(count, 0)

    def test_missing_count_some_missing_pair(self):
        '''userB makes some picks, userA makes K picks, userA missing count is
        total_games-K
        '''
        self.make_picks(self.userB, 1)
        self.make_picks(self.userA, int(len(self.games)/2))
        count = views.num_missing_picks_user(self.userA)
        self.assertEqual(count, int(len(self.games)/2))

    def test_user_progresses_none(self):
        progress = views.PrettyPicksView.get_user_progresses()
        self.assertEqual(progress[self.userA], 0)
        self.assertEqual(progress[self.userB], 0)

    def test_user_progresses_all(self):
        self.make_picks(self.userB, len(self.games))
        self.make_picks(self.userA, len(self.games))
        progress = views.PrettyPicksView.get_user_progresses()
        self.assertEqual(progress[self.userA], 1)
        self.assertEqual(progress[self.userB], 1)

    def test_user_progress_asymmetric(self):
        self.make_picks(self.userB, len(self.games))
        progress = views.PrettyPicksView.get_user_progresses()
        self.assertEqual(progress[self.userA], 0)
        self.assertEqual(progress[self.userB], 1)

    def test_user_progress_partial(self):
        self.make_picks(self.userA, 3*int(len(self.games)/4))
        self.make_picks(self.userB, int(len(self.games)/4))
        progress = views.PrettyPicksView.get_user_progresses()
        self.assertEqual(progress[self.userA], .75)
        self.assertEqual(progress[self.userB], .25)

    def test_user_progress_percentages(self):
        self.make_picks(self.userA, 3*int(len(self.games)/4))
        self.make_picks(self.userB, int(len(self.games)/4))
        progress = views.PrettyPicksView.get_user_progresses(percentage=True)
        self.assertEqual(progress[self.userA], 75)
        self.assertEqual(progress[self.userB], 25)

class ScoreTableTests(TestCase):
    def test_scores_sort_correct(self):
        table = views.ScoreTable([])
        table.scores = [ ('c', 1), ('z', 2), ('c', 3), ('e', 3), ('d', 3) ]
        table.sort_scores()
        expected = [ ('c', 3), ('d', 3), ('e', 3), ('z', 2), ('c', 1)]
        self.assertSequenceEqual(table.scores, expected)

    def test_scores_to_bars(self):
        table = views.ScoreTable([])
        table.scores = list(zip(range(6), range(6)))
        expected = [ (5, 100), (4, 80), (3, 60), (2, 40), (1, 20), (0, 0), ]
        self.assertSequenceEqual(table.scores_as_bars(), expected)


class StarttimeTests(TestCase):
    def minutes_relative_to_start(self, minutes):
        return settings.PICKEM_START_TIME + datetime.timedelta(
                minutes=minutes)

    def test_now_before_starttime(self):
        self.assertFalse(views.pickem_started(
            self.minutes_relative_to_start(-5)))

    def test_now_after_starttime(self):
        self.assertTrue(views.pickem_started(
            self.minutes_relative_to_start(5)))

    def test_now_is_starttime(self):
        self.assertTrue(views.pickem_started(
            self.minutes_relative_to_start(0)))

class OrderedByListTests(TestCase):
    def test_full_list_sorting(self):
        num_items = 5
        lookup = dict(zip(range(num_items), range(num_items)))
        ordering = range(num_items)
        self.assertSequenceEqual(ordering,
                tuple(views.ordered_by_list(ordering, lookup)))

    def test_empty_list_sorting(self):
        num_items = 5
        lookup = dict()
        ordering = range(num_items)
        self.assertSequenceEqual([ None ] * num_items,
                tuple(views.ordered_by_list(ordering, lookup)))

    def test_partial_list_sorting(self):
        num_items = 5
        lookup = dict( { 2:2, 4:4 } )
        ordering = range(num_items)
        self.assertSequenceEqual((None, None, 2, None, 4),
                tuple(views.ordered_by_list(ordering, lookup)))

