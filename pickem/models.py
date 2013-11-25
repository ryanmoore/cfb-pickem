from django.db import models
from django.core.validators import MaxValueValidator, MinValueValidator

class Contest(models.Model):
    name = models.CharField(max_length=200)
    date = models.DateTimeField()
    def __str__(self):
        return self.name

class Team(models.Model):
    name = models.CharField(max_length=200)
    rank = models.IntegerField(default=0)
    contest = models.ForeignKey(Contest)

    def __str__(self):
        return self.name

class Selection(models.Model):
    team = models.ForeignKey(Team)
    contest = models.ForeignKey(Contest)
    wager = models.IntegerField(default=0,
                                 validators=[
                                     MaxValueValidator(5),
                                     MinValueValidator(0)])
    def __str__(self):
        return str(self.contest)
