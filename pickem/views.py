from django.shortcuts import render, get_object_or_404, render
from django.http import HttpResponseRedirect
from pickem.models import Contest, Selection, Team
from django.views import generic
from django.core.urlresolvers import reverse
from django import forms

import logging
logger = logging.getLogger(__name__)

class IndexView(generic.ListView):
    template_name='pickem/index.html'
    context_object_name = 'contest_list'

    def get_queryset(self):
        return Contest.objects.order_by('date')

class ContestView(generic.DetailView):
    model = Contest
    template_name = 'pickem/bowl.html'

class SelectionForm(forms.ModelForm):
    def __init__(self, contest, *args, **kwargs):
        super(SelectionForm, self).__init__(*args, **kwargs)
        self.fields['team'].queryset = contest.team_set.all()
    class Meta:
        model = Selection
        fields = ['team', 'wager']

def select(request, contest_id):
    contest = get_object_or_404(Contest, pk=contest_id)
    queryset = contest.team_set.all()
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

def update_selection_or_create(contest, selected_team, wager):
    try:
        selection = Selection.objects.get(contest=contest)
        selection.team = selected_team
        selection.wager = wager
    except(Selection.DoesNotExist):
        selection = Selection(contest=contest, team=selected_team, wager=wager)
    selection.save()

