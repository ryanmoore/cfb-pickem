from django.shortcuts import render, get_object_or_404, render
from django.http import HttpResponseRedirect
from pickem.models import Contest, Selection, Team
from django.views import generic
from django.core.urlresolvers import reverse

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

def select(request, contest_id):
    contest = get_object_or_404(Contest, pk=contest_id)
    try_again_page = 'pickem/select.html'
    try:
        selected_team = contest.team_set.get(pk=request.POST['team'])
    except(KeyError, Team.DoesNotExist):
        #redisplay selection page
        return render(request, try_again_page, {
                      'contest':contest,
                      'error_message':'You didn\'t select a team.'})
    wager = request.POST['wager']
    if not wager:
        return render(request, try_again_page, {
                      'contest':contest,
                      'error_message':'You didn\'t place a wager.'})
    logger.debug('wager: {}'.format(wager))
    try:
        selection = Selection.objects.get(contest=contest)
        selection.team = selected_team
        selection.wager = wager
    except(Selection.DoesNotExist):
        selection = Selection(contest=contest, team=selected_team, wager=wager)
    selection.save()
    return HttpResponseRedirect(reverse('pickem:contest', args=(contest.id,)))
