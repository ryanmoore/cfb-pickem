from django.test import TestCase
from pickem.models import Game, Selection, Participant, Wager, Winner
from django.contrib.auth.models import User
import django.utils.timezone as timezone
from django.conf import settings

import pickem.views as views

# Create your tests here.

class MissingCalculationTests(TestCase):
    def setUp(self):
        self.userA = User.objects.create(username='bob')
        self.userB = User.objects.create(username='alice')
        self.picks = []
        self.games = []
        for i in range(0, 10):
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

