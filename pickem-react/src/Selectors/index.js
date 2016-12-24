import {
    FETCH_STATES,
} from '../actions';
import {
    createSelector
} from 'reselect';
import forOwn from 'lodash/forOwn';
import cloneDeep from 'lodash/cloneDeep';
import keys from 'lodash/keys';

export const selectCurrentSeason = (state) => state.ui.currentSeason;
export const selectGames = (state) => state.entities.games;
export const selectTeamSeasons = (state) => state.entities.teamseasons;
export const selectParticipants = (state) => state.entities.participants;
export const selectWagers = (state) => state.entities.wagers;
export const selectSelections = (state) => state.entities.selections;
export const selectCurrentUser = (state) => state.auth.user.id;
export const selectUsers = (state) => state.entities.users;

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
            if(wager.user == user) {
                output[id] = wager;
            }
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

const selectAllGamesWithWagersForCurrentSeason = createSelector(
    [selectGamesWithParticipantsForCurrentSeason, selectWagers],
    (games, wagers) => {
        var output = cloneDeep(games);
        forOwn(output, (game) => {
            game.wagers = {};
        });
        forOwn(wagers, (wager) => {
            if (wager.game in games) {
                output[wager.game].wagers[wager.user] = wager.amount;
            }
        });
        return output;
    }
);

export const selectUsernameFromId = (state, id) => {
    return state.entities.users[id].username;
}

const selectAllSelectionsForGames = (state, games) => {
    forOwn(state.entities.selections, (selection) => {
        const participant = state.entities.participants[selection.participant];
        if (participant.game in games) {
            games[participant.game].matchup[participant.id].picks.push(
                selection.user);
        }
    });
}


// Output:
// {
//      <game_id>: {
//          gameDetails: {
//              eventName: str,
//              date: date,
//          },
//          wagers: {
//              <user_id>: wager, ...
//          },
//          matchup: {
//              <part1_id>: {
//                  picks: [<user_id>...],
//                  teamName: str
//              }
//              <part2_id>: {
//                  ...
//              }
//          }
//      }
//      ...
// }
const selectAllPicksForSeason = (state, season) => {
    // TODO: Refactor to avoid this deep copy by making other 2 functions
    // pure
    var games = cloneDeep(selectAllGamesWithWagersForCurrentSeason(state));
    selectAllSelectionsForGames(state, games);
    return games;
}

const zipWagersToPicks = (state, wagers, picks) => {
    return picks.map((id) => {
        return {
            id: id,
            username: selectUsernameFromId(state, id),
            wager: wagers[id]
        }
    });
}

const sortTransformedPicksByDate = (arr) => {
    const getDate = (elt) => elt.gameDetails.date;
    arr.sort((a, b) => {
        if (getDate(a) < getDate(b)) return -1;
        if (getDate(a) > getDate(b)) return 1;
        return 0
    });

}

export const stateIsReadyForPicksPage = (state, season) => {
    const required = [
        'participants',
        'teamseasons',
        'wagers',
        'games',
        'users',
        'selections'
    ];
    return APIDataIsReadyForSeason(state, required, season);
}

export const collectAndTransformPicksForSeason = (state, season) => {
    if (!stateIsReadyForPicksPage(state, season)) {
        return [];
    }
    const gamedata = selectAllPicksForSeason(state, season);
    var output = []
    forOwn(gamedata, (data, id) => {
        const [partid1, partid2] = keys(data.matchup);
        const leftMatchup = data.matchup[partid1];
        const rightMatchup = data.matchup[partid2];
        output.push({
            id: parseInt(id, 10),
            gameDetails: data.gameDetails,
            left: {
                id: partid1,
                picks: zipWagersToPicks(state, data.wagers, leftMatchup.picks),
                teamName: leftMatchup.teamName,
            },
            right: {
                id: partid2,
                picks: zipWagersToPicks(state, data.wagers, rightMatchup.picks),
                teamName: rightMatchup.teamName,
            },
        });
    });
    sortTransformedPicksByDate(output);
    return output;
}
