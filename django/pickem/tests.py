from django.test import TestCase
from pickem.models import Game, Selection, Participant, Wager, Winner, Team, Event, Season, TeamSeason
from django.contrib.auth.models import User
import django.utils.timezone as timezone
from django.conf import settings
from unittest import skip

import pickem.views as views
import datetime

# Create your tests here.

class MissingCalculationTests(TestCase):
    def setUp(self):
        self.userA = User.objects.create(username='bob')
        self.userB = User.objects.create(username='alice')
        self.picks = []
        self.games = []
        self.season = Season.objects.create(year=2000)
        for i in range(0, 12):
            self.games.append(Game.objects.create(event_id=i,
                datetime=timezone.now(), season=self.season))


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

class ScoreTableDBTests(TestCase):
    def setUp(self):
        self.num_games = 5
        self.users = User.objects.create(username="bob"), User.objects.create(
                username="alice")
        self.season = Season.objects.create(year=2000)
        self.games = [ Game.objects.create(event_id=i, datetime=timezone.now(), season=self.season)
                for i in range(self.num_games) ]
        self.teams = [ Team.objects.create(name=str(i)) for i in range(
            len(self.games)*2) ]
        self.teams = [ TeamSeason.objects.create(team=team, season=self.season, record='') for team in self.teams ]
        self.parts = [ Participant.objects.create(game=game, teamseason=team)
                for team, game in zip(self.teams, self.games+self.games) ]

    def set_wagers(self, user, wagers):
        for i, wager in enumerate(wagers):
            Wager.objects.create(user=user,
                    game=self.games[i],
                    amount=wager)

    def make_picks(self, user, participant_ids):
        for i in participant_ids:
            Selection.objects.create(user=user, participant=self.parts[i])

    def make_winners(self, participant_ids):
        for i in participant_ids:
            Winner.objects.create(participant=self.parts[i])

    def test_all_unplayed_games(self):
        table = views.ScoreTable(self.users)
        self.assertEqual(table.unplayed_games().count(), len(self.games))

    def test_all_played_games(self):
        self.make_winners(range(0, len(self.parts), 2))
        table = views.ScoreTable(self.users)
        self.assertEqual(table.unplayed_games().count(), 0)

    def test_user_remaining_none_played(self):
        '''if user has wagers for all games and there are no winners,
        user has all points remaining'''
        self.make_picks(self.users[0], range(0, len(self.parts), 2))
        self.set_wagers(self.users[0], range(len(self.games)))
        table = views.ScoreTable(self.users)
        self.assertEqual(table.calc_user_remaining_points(self.users[0],
            table.unplayed_games()), sum(range(len(self.games))))

    def test_user_remaining_all_played(self):
        '''if user has wagers for all games and all are played,
        user has no points remaining'''
        self.make_picks(self.users[0], range(0, len(self.parts), 2))
        self.set_wagers(self.users[0], range(len(self.games)))
        self.make_winners(range(1, len(self.parts), 2))
        table = views.ScoreTable(self.users)
        self.assertEqual(table.calc_user_remaining_points(self.users[0],
            table.unplayed_games()), 0)

    def test_user_remaining_no_picks(self):
        '''user has picked no teams, user should have no points remaining
        '''
        #self.make_picks(self.users[0], range(0, len(self.parts), 2))
        self.set_wagers(self.users[0], range(len(self.games)))
        table = views.ScoreTable(self.users)
        self.assertEqual(table.calc_user_remaining_points(self.users[0],
            table.unplayed_games()), 0)

class ScoreTableTests(TestCase):
    def test_scores_sort_correct(self):
        table = views.ScoreTable([])
        table.scores = [ ('c', 1), ('z', 2), ('c', 3), ('e', 3), ('d', 3) ]
        table.sort_scores()
        expected = [ ('c', 3), ('d', 3), ('e', 3), ('z', 2), ('c', 1)]
        self.assertSequenceEqual(table.scores, expected)

    @skip("Needs to be corrected after formula update.")
    def test_scores_to_bars(self):
        table = views.ScoreTable([])
        table.scores = list(zip(range(6), range(6)))
        expected = [ (5, 100, 5),
                (4, 80, 4),
                (3, 60, 3),
                (2, 40, 2),
                (1, 20, 1),
                (0, 0, 0), ]
        self.assertSequenceEqual(table.scores_as_bars(), expected)

    @skip("Needs to be corrected after formula update.")
    def test_scores_to_bars_remainder(self):
        table = views.ScoreTable([])
        table.scores = list(zip(range(6), range(6)))
        table.remaining = dict(zip(range(6), reversed(range(6))))
        expected = [ (5, .8*100, 5, .8*0, 0),
                (4, .8*80, 4, .8*20, 1),
                (3, .8*60, 3, .8*40, 2),
                (2, .8*40, 2, .8*60, 3),
                (1, .8*20, 1, .8*80, 4),
                (0, .8*0, 0,  .8*100, 5), ]
        self.assertSequenceEqual(table.scores_as_bars(remainder=True), expected)

class StarttimeTests(TestCase):
    def minutes_relative_to_start(self, minutes):
        return settings.PICKEM_START_TIME + datetime.timedelta(minutes=minutes)

    def test_now_before_starttime(self):
        self.assertFalse(views.pickem_started(
            self.minutes_relative_to_start(-5)))

    def test_now_after_starttime(self):
        self.assertTrue(views.pickem_started(self.minutes_relative_to_start(5)))

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

class GetLatestTest(TestCase):
    def setUp(self):
        self.num_games = 5
        self.users = User.objects.create(username="bob"), User.objects.create(
                username="alice")
        minute_offsets = [ 5, 2, 15, 100, 19 ]
        self.season = Season.objects.create(year=2000)
        self.games = [ Game.objects.create(
            event_id=Event.objects.create(name=str('event {}'.format(i))),
            datetime=timezone.now()+datetime.timedelta(minutes=m),
            season=self.season)
            for i, m in enumerate(minute_offsets) ]
        self.teams = [ Team.objects.create(name=str(i)) for i in range(
            len(self.games)*2) ]
        self.teams = [ TeamSeason.objects.create(team=team, season=self.season, record='') for team in self.teams ]
        self.parts = [ Participant.objects.create(game=game, teamseason=team)
                for team, game in zip(self.teams, self.games+self.games) ]

    def tearDown(self):
        Winner.objects.all().delete()

    def make_winners(self, participant_ids):
        for i in participant_ids:
            Winner.objects.create(participant=self.parts[i])

    def test_find_latest1(self):
        self.make_winners([0, 1])
        self.assertEqual(views.PrettyPicksView.get_last_completed_game(),
                self.games[0])

    def test_find_latest2(self):
        self.make_winners([0, 1, 2, 8, 9])
        self.assertEqual(views.PrettyPicksView.get_last_completed_game(),
                self.games[3])

    def test_find_latest3(self):
        self.make_winners([0, 1, 2, 4])
        self.assertEqual(views.PrettyPicksView.get_last_completed_game(),
                self.games[4])

    def test_get_incompleted_all(self):
        ordered_games = sorted(self.games, key=lambda x: x.datetime)
        self.assertEqual(ordered_games,
                views.PrettyPicksView.get_incomplete_games([]))

    def test_get_incompleted_none(self):
        self.assertEqual([],
                views.PrettyPicksView.get_incomplete_games(self.games))

    def test_get_complete_all(self):
        self.make_winners(range(len(self.games)))
        ordered_games = sorted(self.games, key=lambda x: x.datetime)
        self.assertEqual(ordered_games,
                views.PrettyPicksView.get_completed_games())

    def test_get_complete_none(self):
        self.assertEqual([],
            views.PrettyPicksView.get_completed_games())

    def test_winner_index_first(self):
        self.make_winners([0])
        summary = views.PickSummary(self.games[0], self.users)
        self.assertEqual(summary.get_winner_index(), 0)

    def test_winner_index_second(self):
        self.make_winners([5])
        summary = views.PickSummary(self.games[0], self.users)
        self.assertEqual(summary.get_winner_index(), 1)

