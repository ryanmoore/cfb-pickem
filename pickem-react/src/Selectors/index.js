import forOwn from 'lodash/forOwn';
import cloneDeep from 'lodash/cloneDeep';
import {
    FETCH_STATES,
} from '../actions';
import { createSelector } from 'reselect';

export const selectCurrentSeason = (state) => state.ui.currentSeason;
export const selectGames = (state) => state.entities.games;
export const selectTeamSeasons = (state) => state.entities.teamseasons;
export const selectParticipants = (state) => state.entities.participants;
export const selectWagers = (state) => state.entities.wagers;
export const selectSelections = (state) => state.entities.selections;
export const selectCurrentUser  = (state) => state.ui.currentUser;

export const selectGamesForCurrentSeason = createSelector(
    [selectCurrentSeason, selectGames],
    (season, games) => {
        var currentGames = {}
        forOwn(games, (game, id) => {
            if (game.season === season) {
                currentGames[id] = {
                    id: id,
                    gameDetails: {
                        eventName: game.event,
                        date: new Date(game.datetime),
                    }
                }
            }
        });
        return currentGames;
    }
);

export const selectTeamNamefromTeamSeasons = (teamseasons, id) => {
    return teamseasons[id].team;
}


export const selectParticipantsForCurrentSeason = createSelector(
    [selectGamesForCurrentSeason, selectParticipants],
    (games, participants) => {
        var output = {};
        forOwn(participants, (participant, id) => {
            if (participant.game in games) {
                output[id] = participant;
            }
        });
        return output;
    }
);

export const selectGamesWithParticipantsForCurrentSeason = createSelector(
    [selectGamesForCurrentSeason, selectParticipantsForCurrentSeason, selectTeamSeasons],
    (games, participants, teamseasons) => {
        var output = cloneDeep(games);
        forOwn(participants, (participant, id) => {
            output[participant.game].matchup = output[participant.game].matchup || {};
            output[participant.game].matchup[id] = {
                picks: [],
                teamName: selectTeamNamefromTeamSeasons(
                    teamseasons,
                    participant.teamseason)
            };
        });
        return output;
    }
);

export const APIDataIsReadyForSeason = (state, required, season) => {
    return required.every((type) => state.fetchState[type] === FETCH_STATES.READY);
}

export const selectWagersForCurrentUser = createSelector(
    [selectCurrentUser, selectWagers],
    (user, wagers) => {
        var output = {};
        forOwn(wagers, (wager, id) => {
            output[id] = wager;
        });
        return output;
    }
);

export const selectAllSelectionsForCurrentUser = createSelector(
    [selectCurrentUser, selectSelections],
    (user, selections) => {
        var output = {};
        forOwn(selections, (selection) => {
            if (selection.user === user) {
                output[selection.id] = selection;
            }
        });
        return output;
    }
)
