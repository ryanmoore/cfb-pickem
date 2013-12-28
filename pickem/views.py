import json
import logging

from django.shortcuts import render
from django.views import generic
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.db import transaction
from django.conf import settings
import django.utils.timezone as timezone
from django.db.models import Max as DjangoMax

from pickem.models import Game, Selection, Participant, Wager, Winner
from collections import defaultdict, OrderedDict

# pylint: disable=too-many-ancestors

logger = logging.getLogger(__name__)

class IndexView(generic.TemplateView):
    ''' List all games in a table sorted by date
    '''
    template_name = 'pickem/index.html'
    context_object_name = 'game_list'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['game_list'] = Game.objects.order_by('datetime')
        context['winners'] = [ w.participant for w in Winner.objects.all()]
        return context

    def get_queryset(self):
        return Game.objects.order_by('datetime')


#XXX make prettier.
class GameView(generic.DetailView):
    ''' The specific details of the game
    '''
    model = Game
    template_name = 'pickem/bowl.html'

def pickem_started(reference_time):
    return reference_time >= settings.PICKEM_START_TIME

class ScoreView(generic.TemplateView):
    ''' List all users and their scores
    '''

    template_name = 'pickem/scores.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['start_time'] = settings.PICKEM_START_TIME
        context['started'] = pickem_started(timezone.now())
        context['score_headers'], context['score_table'] = self.make_score_table()

        users = User.objects.all()
        scores = ScoreTable(users)
        context['scores_as_bars'] = scores.scores_as_bars(remainder=True)
        context['progress_bar_style'] = True

        return context

    @staticmethod
    def make_score_table(**kwargs):
        headers = ['User', 'Score']
        users = list(User.objects.all())
        scores = ScoreView.calc_user_scores(users)
        return (headers, scores)

    @staticmethod
    def calc_user_scores(users):
        scores = dict( [ ( user.username, 0 ) for user in users ] )
        winners = Winner.objects.all()
        good_picks = Selection.objects.filter(user__in=users).filter(
                participant__in= [ w.participant for w in winners ] )
        for pick in good_picks:
            scores[pick.user.username] += Wager.objects.filter(user=pick.user,
                    game=pick.participant.game).get().amount
        # negate score instead of reverse=True because we want usernames
        # sorted alphabetically
        return sorted(scores.items(), key=lambda x:(-x[1], x[0]))

class ScoreTable:
    def __init__(self, users):
        self.scores = None
        self.remaining = None
        self.users = users

    def scores_as_table(self):
        if not self.scores:
            self.calc_scores()
        self.sort_scores()
        return self.scores

    def scores_as_bars(self, **kwargs):
        if not self.scores:
            self.calc_scores()
        self.sort_scores()
        self.bar_scores = list(self.scores_to_bars(**kwargs))
        # sort by score, then by reamining points and finally the username
        self.bar_scores.sort(key=lambda x: (-x[2], -x[-1], str(x[0])))
        return self.bar_scores

    def scores_to_bars(self, remainder=False):
        if remainder and not self.remaining:
            self.calc_remaining_points()
        elif not remainder:
            self.remaining = defaultdict(int)
        longest_bar = max(( score[1] + self.remaining[score[0]] for
            score in self.scores))
        for user, score in self.scores:
            score_bar = 100*score/longest_bar
            remaining = self.remaining[user]
            remaining_bar = 100*remaining/longest_bar
            if remainder:
                yield (user, .8*score_bar, score, .8*remaining_bar, remaining)
            else:
                yield (user, score_bar, score)

    def calc_scores(self):
        self.scores = dict( [ ( user, 0 ) for user in self.users ] )
        good_picks = self.select_winning_picks()
        for pick in good_picks:
            self.scores[pick.user] += Wager.objects.filter(
                    user=pick.user,
                    game=pick.participant.game).get().amount
        self.scores = list(self.scores.items())

    def sort_scores(self):
        # negate score instead of reverse=True because we want usernames
        # sorted alphabetically
        self.scores.sort(key=lambda x:(-x[1], str(x[0])))

    def select_winning_picks(self):
        winners = Winner.objects.all()
        return Selection.objects.filter(user__in=self.users).filter(
                participant__in= [ w.participant for w in winners ] )

    def calc_remaining_points(self):
        unplayed = self.unplayed_games()
        self.remaining = []
        for user in self.users:
            self.remaining.append((user, self.calc_user_remaining_points(
                user, unplayed)))
        self.remaining = dict(self.remaining)

    def calc_user_remaining_points(self, user, unplayed):
        games_with_picks = [ sel.participant.game for sel in
                Selection.objects.filter(user=user) ]
        unplayed_with_picks = set(unplayed).intersection(set(games_with_picks))
        wagers = Wager.objects.filter(user=user, game__in=unplayed_with_picks)
        return sum(( wager.amount for wager in wagers))


    @staticmethod
    def unplayed_games():
        played = [ w.participant.game.id for w in Winner.objects.all() ]
        return Game.objects.exclude(id__in=played)


class PicksView(generic.TemplateView):
    '''List all games in table, users across the top
    '''

    template_name = 'pickem/picks.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['picks_headers'], context['picks_table'] = make_picks_table()
        context['started'] = pickem_started(timezone.now())
        context['start_time'] = settings.PICKEM_START_TIME
        return context

def make_picks_table(**kwargs):
    users = list(User.objects.order_by('username'))
    usernames = [ user.username.title() for user in users ]
    headers = ['Game', 'Kickoff'] + usernames
    games = list(Game.objects.order_by('datetime'))
    table_cols = []
    table_cols.append([ game.event.name for game in games ])
    table_cols.append([ pretty_date(game.datetime) for game in games ])
    table_cols.append([ pretty_time(game.datetime) for game in games ])
    for user in users:
        picks, wagers = get_ordered_user_selections(games, user)
        table_cols.append([ wager.amount if wager else 'N/A' for wager in wagers ])
        table_cols.append([ pick.participant.team if pick else 'N/A' for pick in picks ])
    return  headers, list(zip(*table_cols))

def get_ordered_user_selections(ordered_games, user):
    '''Returns (picks, wagers) for the given user in the same order as
    their matching ordered_games
    '''
    wagers = list(user.wager_set.all())
    picks = list(user.selection_set.all())
    wagers = dict([ (wager.game, wager) for wager in wagers ])
    picks = dict( [ (pick.participant.game, pick) for pick in picks] )
    return (ordered_by_list(ordered_games, picks),
            ordered_by_list(ordered_games, wagers))

def ordered_by_list(ordered, lookup):
    '''Orders the values in lookup in the same order as ordered.
    Fills in missing items with None
    '''
    for elt in ordered:
        yield lookup.get(elt, None)

class PrettyPicksView(generic.TemplateView):
    '''List all games with users sorted under team chosen
    '''
    template_name = 'pickem/pretty_picks.html'
    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)

        users = User.objects.all()
        complete_picks, incomplete_picks = self.generate_pick_summaries(users)

        complete_picks = [ PickSummary(game, users) for game in complete_picks ]
        incomplete_picks = [ PickSummary(game, users) for game in incomplete_picks ]

        context['complete_picks'] = complete_picks
        context['incomplete_picks'] = incomplete_picks
        context['started'] = pickem_started(timezone.now())
        context['start_time'] = settings.PICKEM_START_TIME
        if not context['started']:
            context['user_progress'] = sorted(
                    self.get_user_progresses(percentage=True).items(),
                    key=lambda x:(x[1], x[0].username))
        return context

    @staticmethod
    def get_incomplete_games(completed_games):
        all_games = Game.objects.order_by('datetime')
        complete_set = set(completed_games)
        return [ x for x in all_games if x not in complete_set ]

    @staticmethod
    def get_completed_games():
        return [ x.participant.game
                for x in Winner.objects.order_by('participant__game__datetime') ]

    def generate_pick_summaries(self, users):
        completed_games = self.get_completed_games()
        return completed_games, self.get_incomplete_games(completed_games)

    @staticmethod
    def get_last_completed_game():
        return Winner.objects.latest(
                'participant__game__datetime').participant.game

    @staticmethod
    def get_user_completed_percentage(user):
        missing = num_missing_picks_user(user)
        games = Game.objects.all().count()
        return round((games-missing)/games, 2)

    @staticmethod
    def get_user_progresses(percentage=False):
        multiple = 1
        if percentage:
            multiple = 100
        users = User.objects.all().order_by('username')
        return dict( [ (user,
            multiple*PrettyPicksView.get_user_completed_percentage(user))
            for user in users ] )


class PickSummary:
    def __init__(self, game, users):
        self.game = game
        self.users = users
        self.winner_index = self.get_winner_index()

    def get_participants(self):
        return self.game.participant_set.order_by('team__name')

    def picks(self):
        participants = self.get_participants()
        selections = Selection.objects.filter(participant__game=self.game)
        wagers = Wager.objects.filter(game=self.game)
        result = OrderedDict( [ (str(part.team), []) for part in participants ] )
        for selection in selections:
            result[str(selection.participant.team)].append(
                    wagers.get(user=selection.user))
        for key, value in result.items():
            value.sort(key=lambda x: x.amount, reverse=True)
        return result

    def get_winner_index(self):
        try:
            winner = Winner.objects.get(participant__game=self.game).participant
            for index, team in enumerate(self.get_participants()):
                if team == winner:
                    return index
            return None
        except Winner.DoesNotExist:
            return None

def pretty_date(datetime):
    return datetime.strftime('%a %b %d')

def pretty_time(datetime):
    return datetime.strftime('%I:%m %p')

@transaction.atomic
@login_required
def select_all(request):
    '''GET and POST logic for the page where selections occur
    '''
    selection_form_items = all_games_as_forms()
    error = None
    if not pickem_started(timezone.now()) and request.method == 'POST':
        # Data is sent in the form as a single json string object summarizing
        # all picks and orders
        ordering = json.loads(request.POST['matchup_ordering'])
        for idx, game_name in enumerate(ordering):
            pick = request.POST.get(game_name, default=None)
            game_pk = int(game_name.split('=')[1])
            game = Game.objects.get(id=game_pk)
            wager = len(ordering)-idx
            if pick is not None:
                participant = Participant.objects.get(game=game, team_id=pick)
                update_selection_or_create(request.user, participant)
                # always update wager in case the list has been reordered
            update_wager_or_create(request.user, game, wager)
    elif request.method == 'POST':
        error = 'Submission failed. Pickem has already started.'
    update_selection_form_list(request.user, selection_form_items)
    return render(request, 'pickem/select_all.html',
                  {'selection_form_items': selection_form_items,
                      'missing_count' : num_missing_picks_user(request.user),
                      'started' : pickem_started(timezone.now()),
                      'error' : error })

class SelectionFormItem:
    def __init__(self, game, teams, checked=0, wager=0):
        '''
        checked will index from 1.
        checked=0 will check neither. checked=1 the first. checked=2 the second.
        '''
        self.game = game
        self.teams = teams
        self.checked = checked
        self.wager = wager


def all_games_as_forms():
    def game_form():
        for game in Game.objects.all():
            teams = [p.team for p in game.participants]
            yield SelectionFormItem(game=game, teams=teams)
    return list(game_form())


def update_selection_form_list(user, selection_form_items):
    '''Updates the checked field and ordering for the list of form_items
    '''
    for i, form_item in enumerate(selection_form_items):
        try:
            # query for the pick matching this user and this game
            wager = Wager.objects.get(user=user, game=form_item.game)
            form_item.wager = wager.amount
            selection = Selection.objects.get(user=user,
                    participant__game=form_item.game)
            # add 1 because the checked field will index from 1 not 0
            form_item.checked = form_item.teams.index(
                    selection.participant.team) + 1
        except Selection.DoesNotExist:
            form_item.checked = 0
        except Wager.DoesNotExist:
            form_item.wager = i
    selection_form_items.sort(key=lambda x: x.wager, reverse=True)

def num_missing_picks_user(user):
    num_games = Game.objects.all().count()
    num_user_picks = user.selection_set.all().count()
    return num_games - num_user_picks

def update_selection_or_create(user, participant):
    ''' If selection exists for the given user and game, updates the selected
    participant and wager.  Otherwise creates a new one. Saves either way.
    '''
    try:
        selection = Selection.objects.get(user=user,
                participant__game=participant.game)
        selection.participant = participant
    except(Selection.DoesNotExist):
        selection = Selection(user=user, participant=participant)
    selection.save()


def update_wager_or_create(user, game, amount):
    ''' Gets the specified wager and updates its value. Will create the wager
    if none exists
    '''
    wager, created = Wager.objects.get_or_create(user=user, game=game,
            defaults={'amount' : amount })
    if not created:
        wager.amount = amount
        wager.save()
