import json
import logging

from django.shortcuts import render, get_object_or_404
from django.views import generic
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth.models import User, Group
from django.utils.decorators import method_decorator
from django.db import transaction
from django.conf import settings
import django.utils.timezone as timezone
from django.db.models import Max as DjangoMax
from django.http import HttpResponseRedirect, HttpResponseForbidden
from django.urls import reverse

from pickem.models import (Game, Selection, Participant, Wager, Winner, Season,
                           Event, Team, TeamSeason, UserProgress)
from collections import defaultdict, OrderedDict
import pickem.serializers
from rest_framework.views import APIView
from rest_framework import viewsets, mixins
from rest_framework import permissions as rest_permissions
from rest_framework.response import Response
from rest_framework import exceptions as rest_exceptions
import django_filters
import knox.views
from knox.models import AuthToken
from knox.auth import TokenAuthentication

# pylint: disable=too-many-ancestors

logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

class IndexView(generic.TemplateView):
    ''' List all games in a table sorted by date
    '''
    template_name = 'pickem/index.html'
    context_object_name = 'game_list'

    def get_context_data(self, year, **kwargs):
        context = super().get_context_data(**kwargs)
        season = get_object_or_404(Season, year=year)
        context['game_list'] = Game.objects.filter(
            season=season).order_by('datetime')
        context['winners'] = [w.participant
                              for w in Winner.objects.filter(
                                  participant__teamseason__season=season)]
        return context

    def get_queryset(self):
        return Game.objects.order_by('datetime')


#XXX make prettier.
class GameView(generic.DetailView):
    ''' The specific details of the game
    '''
    model = Game
    template_name = 'pickem/bowl.html'

def pickem_started(reference_time, season):
    if settings.PICKEM_START_TIME.year != season.year:
        return True
    return reference_time >= settings.PICKEM_START_TIME

class ScoreView(generic.TemplateView):
    ''' List all users and their scores
    '''

    template_name = 'pickem/scores.html'

    def get_context_data(self, year, **kwargs):
        context = super().get_context_data(**kwargs)
        season = get_object_or_404(Season, year=year)
        context['start_time'] = settings.PICKEM_START_TIME
        context['started'] = pickem_started(timezone.now(), season)
        context['score_headers'], context[
            'score_table'] = self.make_score_table(season)

        users = User.objects.all()
        if not users or not context['started']:
            return context
        scores = ScoreTable(users, season)
        context['scores_as_bars'] = scores.scores_as_bars(remainder=True)
        context['progress_bar_style'] = True

        return context

    @staticmethod
    def make_score_table(season, **kwargs):
        headers = ['User', 'Score']
        users = list(User.objects.all())
        scores = ScoreView.calc_user_scores(users, season)
        return (headers, scores)

    @staticmethod
    def calc_user_scores(users, season):
        scores = dict([(user.username, 0) for user in users])
        winners = Winner.objects.filter(participant__teamseason__season=season)
        good_picks = Selection.objects.filter(
            user__in=users,
            participant__teamseason__season=season).filter(
                participant__in=[w.participant for w in winners])
        for pick in good_picks:
            if pick.participant.game.fixed_wager_amount:
                wager = pick.participant.game.fixed_wager_amount
            else:
                wager = Wager.objects.filter(
                    user=pick.user,
                    game=pick.participant.game).get().amount
            scores[pick.user.username] += wager
        # negate score instead of reverse=True because we want usernames
        # sorted alphabetically
        return sorted(scores.items(), key=lambda x:(-x[1], x[0]))

class ScoreTable:
    def __init__(self, users, season):
        self.season = season
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
        self.bar_scores.sort(key=lambda x: (-x[2], -x[4], str(x[0])))
        return self.bar_scores

    def scores_to_bars(self, remainder=False):
        if remainder and not self.remaining:
            self.calc_remaining_points()
        elif not remainder:
            self.remaining = defaultdict(int)
        longest_bar = max(( score[1] + self.remaining[score[0]] for
            score in self.scores))
        longest_bar = max(longest_bar, 10)
        for user, score in self.scores:
            score_bar = 100*score/longest_bar
            remaining = self.remaining[user]
            remaining_bar = 100*remaining/longest_bar
            if remainder:
                main_area_factor = .75
                leftover = 100 - sum((10,
                    main_area_factor*score_bar,
                    main_area_factor*remaining_bar))
                yield (user,
                        main_area_factor*score_bar,
                        score,
                        main_area_factor*remaining_bar,
                        remaining,
                        leftover)
            else:
                yield (user, score_bar, score)

    def calc_scores(self):
        self.scores = dict( [ ( user, 0 ) for user in self.users ] )
        good_picks = self.select_winning_picks()
        for pick in good_picks:
            if pick.participant.game.fixed_wager_amount:
                wager = pick.participant.game.fixed_wager_amount
            else:
                wager = Wager.objects.filter(user=pick.user,
                    game=pick.participant.game).get().amount
            self.scores[pick.user] += wager
        self.scores = list(self.scores.items())

    def sort_scores(self):
        # negate score instead of reverse=True because we want usernames
        # sorted alphabetically
        self.scores.sort(key=lambda x:(-x[1], str(x[0])))

    def select_winning_picks(self):
        winners = Winner.objects.filter(
            participant__teamseason__season=self.season)
        return Selection.objects.filter(
            user__in=self.users,
            participant__teamseason__season=self.season).filter(
                participant__in=[w.participant for w in winners])

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
        conf_games_sum = sum(( wager.amount for wager in wagers))
        fixed_games_sum = sum((game.fixed_wager_amount for game in unplayed_with_picks))
        return fixed_games_sum + conf_games_sum

    @staticmethod
    def unplayed_games():
        played = [ w.participant.game.id for w in Winner.objects.all() ]
        return Game.objects.exclude(id__in=played)


class PicksView(generic.TemplateView):
    '''List all games in table, users across the top
    '''

    template_name = 'pickem/picks.html'

    def get_context_data(self, year, **kwargs):
        context = super().get_context_data(**kwargs)
        season = get_object_or_404(Season, year=year)
        context['picks_headers'], context['picks_table'] = make_picks_table(
            season)
        context['started'] = pickem_started(timezone.now(), season)
        context['start_time'] = settings.PICKEM_START_TIME
        return context

def make_picks_table(season, **kwargs):
    users = list(User.objects.order_by('username'))
    usernames = [ user.username.title() for user in users ]
    headers = ['Game', 'Kickoff'] + usernames
    games = list(Game.objects.filter(season=season).order_by('datetime'))
    table_cols = []
    table_cols.append([ game.event.name for game in games ])
    table_cols.append([ pretty_date(game.datetime) for game in games ])
    table_cols.append([ pretty_time(game.datetime) for game in games ])
    for user in users:
        picks, wagers = get_ordered_user_selections(games, user)
        table_cols.append([wager.amount if wager else 'N/A' for wager in wagers
                          ])
        table_cols.append([pick.participant.teamseason if pick else 'N/A'
                           for pick in picks])
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
    def get_context_data(self,
                         year,
                         add_winner_buttons=False,
                         winner_added=None,
                         winner_create_success=False,
                         **kwargs):
        context = super().get_context_data(**kwargs)
        season = get_object_or_404(Season, year=year)

        users = User.objects.all()
        complete_picks, incomplete_picks = self.generate_pick_summaries(season)

        complete_picks = [PickSummary(game, users) for game in complete_picks]
        incomplete_picks = [PickSummary(game, users)
                            for game in incomplete_picks]

        context['complete_picks'] = complete_picks
        context['incomplete_picks'] = incomplete_picks
        context['started'] = pickem_started(timezone.now(), season)
        context['start_time'] = settings.PICKEM_START_TIME
        context['add_winner_buttons'] = add_winner_buttons
        if not context['started']:
            context['user_progress'] = sorted(
                    self.get_user_progresses(True, season).items(),
                    key=lambda x:(x[1], x[0].username))
        return context

    @staticmethod
    def get_incomplete_games(completed_games, season):
        all_games = Game.objects.filter(season=season).order_by('datetime')
        complete_set = set(completed_games)
        return [ x for x in all_games if x not in complete_set ]

    @staticmethod
    def get_completed_games(season):
        return [x.participant.game
                for x in Winner.objects.filter(
                    participant__teamseason__season=season).order_by(
                        'participant__game__datetime')]

    def generate_pick_summaries(self, season):
        completed_games = self.get_completed_games(season)
        return completed_games, self.get_incomplete_games(completed_games,
                                                          season)

    @staticmethod
    def get_last_completed_game():
        return Winner.objects.latest(
                'participant__game__datetime').participant.game

    @staticmethod
    def get_user_completed_percentage(user, season):
        missing = num_missing_picks_user(user, season)
        games = Game.objects.filter(season=season).count()
        return round((games-missing)/games, 2)

    @staticmethod
    def get_user_progresses(percentage, season):
        multiple = 1
        if percentage:
            multiple = 100
        users = User.objects.all().order_by('username')
        return dict([(user, multiple *
                      PrettyPicksView.get_user_completed_percentage(
                          user, season)) for user in users])


class PickSummary:
    def __init__(self, game, users):
        self.game = game
        self.users = users
        self.winner_index = self.get_winner_index()
        self.picks = self.gather_picks()

    def get_participants(self):
        return self.game.participant_set.order_by('teamseason__team__name')

    def gather_picks(self):
        participants = self.get_participants()
        selections = Selection.objects.filter(participant__game=self.game)
        def user_wager_function(game):
            '''If fixed value amount game, return function that
            returns the fixed value. Otherwise return one that does
            lookups
            '''
            if game.fixed_wager_amount:
                return lambda x: Wager(game=game,
                        amount=game.fixed_wager_amount,
                        user=x)
            else:
                wagers = Wager.objects.filter(game=self.game)
                return lambda user: wagers.get(user=user)
        get_user_wager = user_wager_function(self.game)
        result = OrderedDict([(part.teamseason, [])
                              for part in participants])
        for selection in selections:
            result[selection.participant.teamseason].append(
                    get_user_wager(selection.user))
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
def select_all(request, year):
    '''GET and POST logic for the page where selections occur
    '''
    season = get_object_or_404(Season, year=year)
    selection_form_items, fixed_value_games = all_games_as_forms(season)
    error = None
    if not pickem_started(timezone.now(), season) and request.method == 'POST':
        # Data is sent in the form as a single json string object summarizing
        # all picks and orders
        ordering = json.loads(request.POST['matchup_ordering'])
        for idx, game_name in enumerate(ordering):
            pick = request.POST.get(game_name, default=None)
            game_pk = int(game_name.split('=')[1])
            game = Game.objects.get(id=game_pk)
            wager = len(ordering)-idx
            if pick is not None:
                participant = Participant.objects.get(game=game,
                                                      teamseason__team_id=pick)
                update_selection_or_create(request.user, participant)
                # always update wager in case the list has been reordered
            update_wager_or_create(request.user, game, wager)
        logger.info(request.POST)
        for game in fixed_value_games:
            post_key = 'game={}'.format(game.game.pk)
            logging.info('post_key: {}'.format(post_key))
            pick = request.POST.get(post_key, default=None)
            if pick is not None:
                logger.info('Updating fixed value wager for: {}'.format(game.game))
                logger.info('Pick is: {}'.format(pick))
                participant = Participant.objects.get(game=game.game,
                                                      teamseason__team_id=pick)
                logger.info('New selection: {}'.format(participant))
                update_selection_or_create(request.user, participant)
            else:
                logger.info('No update for: {}'.format(game.game))

    elif request.method == 'POST':
        error = 'Submission failed. Pickem has already started.'
    update_selection_form_list(request.user, selection_form_items)
    update_selection_form_list(request.user, fixed_value_games)
    return render(
        request, 'pickem/select_all.html',
        {'selection_form_items': selection_form_items,
         'fixed_value_games': fixed_value_games,
         'all_games': selection_form_items + fixed_value_games,
         'missing_count': num_missing_picks_user(request.user, season),
         'started': pickem_started(timezone.now(), season),
         'error': error})

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


def all_games_as_forms(season):
    def game_form(fixed_value_games):
        if fixed_value_games:
            games = Game.objects.filter(season=season).exclude(fixed_wager_amount=0)
        else:
            games = Game.objects.filter(fixed_wager_amount=0, season=season)
        for game in games:
            teams = [p.teamseason for p in game.participants]
            yield SelectionFormItem(game=game, teams=teams)
    return list(game_form(False)), list(game_form(True))


def update_selection_form_list(user, selection_form_items):
    '''Updates the checked field and ordering for the list of form_items
    '''
    import random
    random.shuffle(selection_form_items)
    for i, form_item in enumerate(selection_form_items):
        try:
            # query for the pick matching this user and this game
            if form_item.game.fixed_wager_amount:
                form_item.wager = form_item.game.fixed_wager_amount
            else:
                wager = Wager.objects.get(user=user, game=form_item.game)
                form_item.wager = wager.amount
            selection = Selection.objects.get(user=user,
                    participant__game=form_item.game)
            # add 1 because the checked field will index from 1 not 0
            form_item.checked = form_item.teams.index(
                    selection.participant.teamseason) + 1
        except Selection.DoesNotExist:
            form_item.checked = 0
        except Wager.DoesNotExist:
            # can only be a non-fixed-value game
            assert(not form_item.game.fixed_wager_amount)
            form_item.wager = i
    selection_form_items.sort(key=lambda x: x.wager, reverse=True)

def num_missing_picks_user(user, season):
    num_games = Game.objects.filter(season=season).count()
    num_user_picks = user.selection_set.filter(
        participant__teamseason__season=season).count()
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




@method_decorator(user_passes_test(lambda u: u.is_superuser), name='dispatch')
class AddWinner(generic.View):

    def post(self, request, year, teamseason_id, *args, **kwargs):
        season = get_object_or_404(Season, year=year)
        participant = get_object_or_404(Participant, teamseason__id=teamseason_id)
        winner, created = Winner.objects.get_or_create(participant=participant)
        return HttpResponseRedirect(
            reverse('pickem:picks',
                    kwargs={'year': year}),
            # TODO: still need to appropriately route these to the picks page
            # for the message to display. As an admin-only feature, can
            # add later
            {'winner_create_success': created,
             'winner_added': winner.participant.teamseason.team,})


class UserViewSet(viewsets.ModelViewSet):
    ''' API endpoint that allows users to be viewed or edited
    '''
    queryset = User.objects.all().order_by('-date_joined')
    serializer_class = pickem.serializers.UserSerializer
    permission_classes = [rest_permissions.DjangoModelPermissionsOrAnonReadOnly]


class GroupViewSet(viewsets.ModelViewSet):
    ''' API endpoint that allows groups to be viewed or edited
    '''
    queryset = Group.objects.all()
    serializer_class = pickem.serializers.GroupSerializer
    permission_classes = [rest_permissions.IsAuthenticatedOrReadOnly,
                   rest_permissions.DjangoModelPermissionsOrAnonReadOnly]


class EventViewSet(viewsets.ModelViewSet):
    ''' API endpoint that allows events to be viewed or edited
    '''
    lookup_value_regex = '[^/]+'
    queryset = Event.objects.all()
    serializer_class = pickem.serializers.EventSerializer
    permission_classes = [rest_permissions.IsAuthenticatedOrReadOnly,
                   rest_permissions.DjangoModelPermissionsOrAnonReadOnly]


class SeasonViewSet(viewsets.ModelViewSet):
    ''' API endpoint that allows seasons to be viewed or edited
    '''
    queryset = Season.objects.all()
    serializer_class = pickem.serializers.SeasonSerializer
    permission_classes = [rest_permissions.IsAuthenticatedOrReadOnly,
                   rest_permissions.DjangoModelPermissionsOrAnonReadOnly]


class GameViewSet(viewsets.ModelViewSet):
    ''' API endpoint that allows games to be viewed or edited
    '''
    queryset = Game.objects.all()
    serializer_class = pickem.serializers.GameSerializer
    permission_classes = [rest_permissions.IsAuthenticatedOrReadOnly,
                   rest_permissions.DjangoModelPermissionsOrAnonReadOnly]
    filter_fields = ('season',)


class TeamViewSet(viewsets.ModelViewSet):
    ''' API endpoint that allows teams to be viewed or edited
    '''
    # TODO: .+ Seems very broad for regex, but we are stuck with something
    # quite broad as a consequence of using team names as pks.
    # Would like to change Team and Events to use surrogate pks for better
    # handling here and overall (it's reasonable we want to change names for
    # both - initial schema was too aggresive designating those pks)
    lookup_value_regex = '.+'
    queryset = Team.objects.all()
    serializer_class = pickem.serializers.TeamSerializer
    permission_classes = [rest_permissions.IsAuthenticatedOrReadOnly,
                   rest_permissions.DjangoModelPermissionsOrAnonReadOnly]


class TeamSeasonViewSet(viewsets.ModelViewSet):
    ''' API endpoint that allows teamseasons to be viewed or edited
    '''
    queryset = TeamSeason.objects.all()
    serializer_class = pickem.serializers.TeamSeasonSerializer
    permission_classes = [rest_permissions.IsAuthenticatedOrReadOnly,
                   rest_permissions.DjangoModelPermissionsOrAnonReadOnly]
    filter_fields = ('season',)


class ParticipantFilter(django_filters.rest_framework.FilterSet):
    season = django_filters.NumberFilter(name='teamseason__season')
    class Meta:
        model = Participant
        fields = ('season',)


class ParticipantViewSet(viewsets.ModelViewSet):
    ''' API endpoint that allows participants to be viewed or edited
    '''
    queryset = Participant.objects.all()
    serializer_class = pickem.serializers.ParticipantSerializer
    permission_classes = [rest_permissions.IsAuthenticatedOrReadOnly,
                   rest_permissions.DjangoModelPermissionsOrAnonReadOnly]
    filter_class = ParticipantFilter


class WinnerViewSet(viewsets.ModelViewSet):
    ''' API endpoint that allows winners to be viewed or edited
    '''
    queryset = Winner.objects.all()
    serializer_class = pickem.serializers.WinnerSerializer
    permission_classes = [rest_permissions.IsAuthenticatedOrReadOnly,
                   rest_permissions.DjangoModelPermissionsOrAnonReadOnly]


class SelectionFilter(django_filters.rest_framework.FilterSet):
    season = django_filters.NumberFilter(name='participant__teamseason__season')
    class Meta:
        model = Selection
        fields = ('season',)


class SelectionViewSet(viewsets.ModelViewSet):
    ''' API endpoint that allows selections to be viewed or edited
    '''
    queryset = Selection.objects.all()
    serializer_class = pickem.serializers.SelectionSerializer
    permission_classes = [rest_permissions.IsAuthenticatedOrReadOnly,
                   rest_permissions.DjangoModelPermissionsOrAnonReadOnly]
    filter_class = SelectionFilter


class WagerFilter(django_filters.rest_framework.FilterSet):
    season = django_filters.NumberFilter(name='game__season')
    class Meta:
        model = Wager
        fields = ('season',)


class WagerViewSet(viewsets.ModelViewSet):
    ''' API endpoint that allows wagers to be viewed or edited
    '''
    queryset = Wager.objects.all()
    serializer_class = pickem.serializers.WagerSerializer
    permission_classes = [rest_permissions.IsAuthenticatedOrReadOnly,
                   rest_permissions.DjangoModelPermissionsOrAnonReadOnly]
    filter_class = WagerFilter


class ProgressViewSet(viewsets.GenericViewSet, mixins.ListModelMixin):
    permission_classes = [rest_permissions.IsAuthenticatedOrReadOnly]
    serializer_class = pickem.serializers.UserProgressSerializer
    def get_queryset(self):
        season = int(self.kwargs['season'])
        wagers = list(Selection.objects.filter(participant__teamseason__season=season))

        counts = {}
        for wager in wagers:
            counts[wager.user] = counts.get(wager.user, 0) + 1

        user_progress = [UserProgress(user.id, season, count)
                          for user, count in counts.items()]
        return user_progress


class MakePicksView(APIView):
    '''View to make pickem selections and change wagers
    '''
    # TODO: Should be checking this incoming data more and probably using
    # DRF built-in serializers. This is very fragile right now to poorly
    # formatted incoming data

    permission_classes = [rest_permissions.IsAuthenticated,]

    @staticmethod
    def dbg_print_gameids(games):
        for game in season_games:
            if game.fixed_wager_amount:
                print('{}*'.format(game.id))
            else:
                print('{}'.format(game.id))

    @staticmethod
    def get_selected_participants_from_raw(data):
        for game in data:
            try:
                yield game['selection']['participant']
            except KeyError:
                pass

    @staticmethod
    def validate_participant_in_game(game, pick, participants):
        try:
            participant_id = pick['selection']['participant']
        except KeyError:
            return None
        participant = participants[participant_id]
        if participant.game != game:
            raise rest_exceptions.ValidationError(
                'Participant(id={}) does not match Game(id={})'.format(participant.id,
                                                                game.id))

    def validate_data(self, request):
        '''Checks the input data and returns (games, participants) where
        games is the ordered list of games.
            i.e. games[0] has a wager of 1
        '''
        seasonid = int(request.data['picks']['season'])
        season = get_object_or_404(Season, id=seasonid)
        started = pickem_started(timezone.now(), season)
        if started:
            raise rest_exceptions.PermissionDenied('Pickem has started.')
        fixed_picks = request.data['picks']['fixed']
        weighted_picks = request.data['picks']['wagered']

        all_game_ids = [data['game'] for data in fixed_picks+weighted_picks]
        all_participant_ids = self.get_selected_participants_from_raw(
            fixed_picks + weighted_picks)
        season_games = list(Game.objects.filter(season=season))
        if len(season_games) != len(all_game_ids):
            raise rest_exceptions.ValidationError(
                'Expected {} games for this season. Found: {}'.format(
                    len(season_games), len(all_game_ids)))

        games = Game.objects.in_bulk(all_game_ids)
        participants = Participant.objects.in_bulk(all_participant_ids)

        for elt in fixed_picks+weighted_picks:
            game = games[elt['game']]
            if game.season != season:
                raise rest_exceptions.ValidationError(
                    'Game(id={}) not in specified season'.format(game.id))
            self.validate_participant_in_game(game, elt, participants)
            if elt in weighted_picks:
                if game.fixed_wager_amount != 0:
                    raise rest_exceptions.ValidationError(
                        'Game(id={}) not allowed as weighted pick'.format(game.id))

        ordered_weighted = [games[elt['game']] for elt in weighted_picks]
        return (ordered_weighted, participants.values())

    def put(self, request):
        (games, participants) = self.validate_data(request)

        for participant in participants:
            update_selection_or_create(request.user, participant)
        for wager, game in enumerate(games, start=1):
            update_wager_or_create(request.user, game, wager)

        return Response()


class LoginView(knox.views.LoginView):
    @staticmethod
    def find_token_expiration(digest):
        auther = TokenAuthentication()
        # XXX This is pretty wasteful since token auth can be expensive
        # but should suffice until:
        # https://github.com/James1345/django-rest-knox/issues/131
        return auther.authenticate_credentials(
            digest.encode('utf-8'))[1].expires

    def post(self, *args, **kwargs):
        response = super().post(*args, **kwargs)
        token_digest = response.data.get('token')
        if token_digest:
            expiration = self.find_token_expiration(token_digest)
            response.data['token_expires'] = expiration.isoformat()
        return response
