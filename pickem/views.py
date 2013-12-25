import json
import logging

from django.shortcuts import render
from django.views import generic
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import User
from django.db import transaction
from django.conf import settings
import django.utils.timezone as timezone

from pickem.models import Game, Selection, Participant, Wager, Winner
from collections import defaultdict

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

def pickem_started():
    return timezone.now() >= settings.PICKEM_START_TIME

class ScoreView(generic.TemplateView):
    ''' List all users and their scores
    '''

    template_name = 'pickem/scores.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['started'] = pickem_started()
        context['score_headers'], context['score_table'] = self.make_score_table()
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
        good_picks = Selection.objects.filter(participant__in=winners,
                user__in=users)
        all_user_wagers = Wager.objects.filter(user__in=users)
        for pick in good_picks:
            scores[pick.user.username] += Wager.objects.filter(user=pick.user,
                    game=pick.participant.game).amount
        # negate score instead of reverse=True because we want usernames
        # sorted alphabetically
        return sorted(scores.items(), key=lambda x:(-x[1], x[0]))




class PicksView(generic.TemplateView):
    '''List all games in table, users across the top
    '''

    template_name = 'pickem/picks.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context['picks_headers'], context['picks_table'] = make_picks_table()
        context['started'] = pickem_started()
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
        games = Game.objects.order_by('datetime')
        users = User.objects.all()
        pick_summaries = [ PickSummary(game, users) for game in games ]
        context['pick_summaries'] = pick_summaries
        context['started'] = pickem_started()
        return context

class PickSummary:
    def __init__(self, game, users):
        self.game = game
        self.users = users

    @property
    def participants(self):
        return sorted(self.game.participant_set.all(),
                key=lambda x: str(x.team))

    def picks(self):
        participants = self.participants
        selections = Selection.objects.filter(participant__game=self.game)
        wagers = Wager.objects.filter(game=self.game)
        result = dict( [ (str(part.team), []) for part in participants ] )
        for selection in selections:
            result[str(selection.participant.team)].append(
                    wagers.get(user=selection.user))
        for key, value in result.items():
            value.sort(key=lambda x: x.amount, reverse=True)
        return result

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
    if not pickem_started() and request.method == 'POST':
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
    missing = update_selection_form_list(request.user, selection_form_items)
    return render(request, 'pickem/select_all.html',
                  {'selection_form_items': selection_form_items,
                      'missing_count' : missing,
                      'started' : pickem_started(),
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
    return num_missing_picks(selection_form_items)

def num_missing_picks(selection_form_items):
    return len([x for x in selection_form_items if x.checked == 0 ])


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
