import json
import logging

from django.shortcuts import render
from django.views import generic
from django.contrib.auth.decorators import login_required

from pickem.models import Game, Selection, Participant

logger = logging.getLogger(__name__)

class IndexView(generic.ListView):
    template_name='pickem/index.html'
    context_object_name = 'game_list'

    def get_queryset(self):
        return Game.objects.order_by('datetime')


class GameView(generic.DetailView):
    model = Game
    template_name = 'pickem/bowl.html'


@login_required
def select_all(request):
    selection_form_items = all_games_as_forms(request.user)
    if request.method == 'POST':
        ordering = json.loads(request.POST['selections'])
        for idx, game_name in enumerate(ordering):
            pick = request.POST.get(game_name, default=None)
            game_pk = int(game_name.split('=')[1])
            wager = idx + 1
            if pick is not None:
                participant = Participant.objects.get(game_id=game_pk, team_id=pick)
                update_selection_or_create(request.user, participant, wager)
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


def all_games_as_forms(user):
    def game_form():
        for game in Game.objects.all():
            teams = [p.team for p in game.participants]
            yield SelectionFormItem(game=game, teams=teams)

    return list(game_form())


def update_selection_form_list(user, selection_form_items):
    '''Updates the checked field and ordering for the list of form_items'''
    for form_item in selection_form_items:
        try:
            # query for the pick matching this user and this game
            selection = Selection.objects.get(user=user, participant__game=form_item.game)
            # add 1 because the checked field will index from 1 not 0
            form_item.checked = form_item.teams.index(selection.participant.team) + 1
            form_item.wager = selection.wager
        except Selection.DoesNotExist:
            form_item.checked = 0
            form_item.wager = 0
    return


def update_selection_or_create(user, participant, wager):
    ''' If selection exists for the given user and game, updates the selected participant and wager.
    Otherwise creates a new one. Saves either way.
    '''
    try:
        selection = Selection.objects.get(user=user, participant__game=participant.game)
        selection.participant = participant
        selection.wager = wager
    except(Selection.DoesNotExist):
        selection = Selection(user=user, participant=participant, wager=wager)
    selection.save()


"""
class SelectionForm(forms.ModelForm):
    def __init__(self, contest, *args, **kwargs):
        ''' Change the listed selection of teams to limit it to those involved
        in this contest '''
        super(SelectionForm, self).__init__(*args, **kwargs)
        self.fields['team'].queryset = contest.team_set.all()
    class Meta:
        model = Selection
        fields = ['team', 'wager']

def select(request, contest_id):
    contest = get_object_or_404(Contest, pk=contest_id)
    if request.method == 'POST':
        form = SelectionForm(contest, request.POST)
        if form.is_valid():
            selected_team = form.cleaned_data['team']
            wager = form.cleaned_data['wager']
            update_selection_or_create(contest, selected_team, wager)
            return HttpResponseRedirect(reverse('pickem:contest', args=(contest.id,)))
    else:
        form = SelectionForm(contest)
    return render(request, 'pickem/select.html', {
        'contest':contest,
        'form':form,
    })

def select_all(request):
    contests = Contest.objects.order_by('date')
    if request.method == 'POST':
        forms = [ SelectionForm(contest, request.POST, prefix=contest.id) for contest in contests]
        if all([form.is_valid() for form in forms]):
            for contest, form in zip(contests, forms):
                selected_team = form.cleaned_data['team']
                wager = form.cleaned_data['wager']
                update_selection_or_create(contest, selected_team, wager)
            return HttpResponseRedirect(reverse('pickem:index'))
    else:
        forms = [ SelectionForm(contest, prefix=contest.id) for contest in contests]

    return render(request, 'pickem/select_all.html', {'forms':forms})

def select_all_sortable(request):
    print(request.POST)
    if request.method == 'POST':
        ordering = json.loads(request.POST['thedata'])
        for bowl in ordering:
            print(bowl, request.POST[bowl])
    return render(request, 'pickem/select_all_sortable.html')
    #contests = Contest.objects.order_by('date')

def update_selection_or_create(contest, selected_team, wager):
    ''' If selection exists for the given contest, updates the team and wager.
    Otherwise creates a new one. Saves either way.
    '''
    try:
        selection = Selection.objects.get(contest=contest)
        selection.team = selected_team
        selection.wager = wager
    except(Selection.DoesNotExist):
        selection = Selection(contest=contest, team=selected_team, wager=wager)
    selection.save()

"""
