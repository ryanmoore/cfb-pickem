import forOwn from 'lodash/forOwn';
import {
    FETCH_STATES,
} from '../actions';

export const selectGamesForSeason = (state, season) => {
    var games = {}
    forOwn(state.entities.games, (game, id) => {
        if (game.season === season) {
            games[id] = {
                id: id,
                gameDetails: {
                    eventName: game.event,
                    date: new Date(game.datetime),
                }
            }
        }
    });
    return games;
}

export const selectTeamNamefromTeamSeason = (state, id) => {
    return state.entities.teamseasons[id].team;
}

export const selectAllParticipantsForGames = (state, games) => {
    forOwn(state.entities.participants, (participant, id) => {
        if (participant.game in games) {
            games[participant.game].matchup = games[participant.game].matchup || {};
            games[participant.game].matchup[id] = {
                picks: [],
                teamName: selectTeamNamefromTeamSeason(
                    state,
                    participant.teamseason)
            };
        }
    });
}

export const APIDataIsReadyForSeason = (state, required, season) => {
    return required.every((type) => state.fetchState[type] === FETCH_STATES.READY);
}
