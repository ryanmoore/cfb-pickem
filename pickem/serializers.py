
from django.contrib.auth.models import User, Group
from rest_framework import serializers
import pickem.models

class UserAuthSerializer(serializers.ModelSerializer):
    '''Auth serializer provided to knox for sending back authenticated
    user info
    '''
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'groups', 'is_superuser')


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('url', 'id', 'username', 'email', 'groups')


class GroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ('url', 'id', 'name')


class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = pickem.models.Event
        fields = ('url', 'name')


class SeasonSerializer(serializers.ModelSerializer):
    class Meta:
        model = pickem.models.Season
        fields = ('url', 'id', 'year', 'start_time')


class EventNameSerializer(serializers.ModelSerializer):
    class Meta:
        model = pickem.models.Event
        fields = ('name',)


class GameSerializer(serializers.ModelSerializer):
    event = EventNameSerializer()
    class Meta:
        model = pickem.models.Game
        fields = ('url', 'id', 'event', 'datetime', 'fixed_wager_amount', 'season')


class TeamSerializer(serializers.ModelSerializer):
    class Meta:
        model = pickem.models.Team
        fields = ('url', 'name', 'site')


class TeamSeasonSerializer(serializers.ModelSerializer):
    class Meta:
        model = pickem.models.TeamSeason
        fields = ('url', 'id', 'season', 'team', 'record', 'rank')


class ParticipantSerializer(serializers.ModelSerializer):
    class Meta:
        model = pickem.models.Participant
        fields = ('url', 'id', 'game', 'teamseason')


class WinnerSerializer(serializers.ModelSerializer):
    class Meta:
        model = pickem.models.Winner
        fields = ('url', 'id', 'participant')


class SelectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = pickem.models.Selection
        fields = ('url', 'id', 'user', 'participant')


class WagerSerializer(serializers.ModelSerializer):
    class Meta:
        model = pickem.models.Wager
        fields = ('url', 'id', 'user', 'game', 'amount')


#class MakePicksWagerSerializer(serializer.Serializer):
#
#class MakePicksWagerSerializer(serializer.Serializer):
#    game =  serializer.IntegerField()
#    selection =  serializer.IntegerField()


#class MakePicksWagerListSerializer(serializers.ListSerializer):


#class MakePicksSerializer(serializers.Serializer):

