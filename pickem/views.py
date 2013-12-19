import json
import logging

from django.shortcuts import render
from django.views import generic
from django.contrib.auth.decorators import login_required

from pickem.models import Game, Selection, Participant, Wager

# pylint: disable=too-many-ancestors

logger = logging.getLogger(__name__)

class IndexView(generic.ListView):
    ''' List all games in a table sorted by date
    '''
    template_name = 'pickem/index.html'
    context_object_name = 'game_list'

    def get_queryset(self):
        return Game.objects.order_by('datetime')


#XXX make prettier.
class GameView(generic.DetailView):
    ''' The specific details of the game
    '''
    model = Game
    template_name = 'pickem/bowl.html'


@login_required
def select_all(request):
    '''GET and POST logic for the page where selections occur
    '''
    selection_form_items = all_games_as_forms()
    if request.method == 'POST':
        # Data is sent in the form as a single json string object summarizing
        # all picks and orders
        ordering = json.loads(request.POST['matchup_ordering'])
        for idx, game_name in enumerate(ordering):
            pick = request.POST.get(game_name, default=None)
            game_pk = int(game_name.split('=')[1])
            game = Game.objects.get(id=game_pk)
            wager = idx + 1
            if pick is not None:
                participant = Participant.objects.get(game=game, team_id=pick)
                update_selection_or_create(request.user, participant)
                # always update wager in case the list has been reordered
            update_wager_or_create(request.user, game, wager)
    update_selection_form_list(request.user, selection_form_items)
    return render(request, 'pickem/select_all.html',
                  {'selection_form_items': selection_form_items})
    #contests = Contest.objects.order_by('date')

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
    selection_form_items.sort(key=lambda x: x.wager)
    return


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
