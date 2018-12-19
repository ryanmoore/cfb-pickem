import {
    FETCH_STATES,
} from '../actions';
import {
    createSelector
} from 'reselect';
import forOwn from 'lodash/forOwn';
import cloneDeep from 'lodash/cloneDeep';
import keys from 'lodash/keys';

export const selectGames = (state) => state.entities.games;
export const selectTeamSeasons = (state) => state.entities.teamseasons;
export const selectParticipants = (state) => state.entities.participants;
export const selectWagers = (state) => state.entities.wagers;
export const selectSelections = (state) => state.entities.selections;
export const selectSeasons = (state) => state.entities.seasons;
export const selectProgress = (state) => state.entities.progress;
export const selectCurrentUser = (state) => state.auth.user.id;
export const selectUsers = (state) => state.entities.users;
export const selectMatchupOrdering = (state) => state.ui.makePicksOrdering.matchupOrdering;
export const selectCurrentUIPicks = (state) => state.ui.makePicksOrdering.picks;
export const selectWinners = (state) => state.entities.winners;
export const selectCurrentYear = (state) => state.ui.currentYear;

export const selectCurrentSeason = createSelector(
    [selectCurrentYear, selectSeasons],
    (year, seasons) => {
        var output = null;
        forOwn(seasons, (season, id) => {
            if(season.year === year) {
                output = parseInt(id, 10);
                return false; // break out of the forOwn loop
            }
        });
        return output;
    }
);

export const selectGamesForCurrentSeason = createSelector(
    [selectCurrentSeason, selectGames],
    (season, games) => {
        var currentGames = {}
        forOwn(games, (game, id) => {
            if (game.season === season) {
                currentGames[id] = {
                    id: parseInt(id, 10),
                    gameDetails: {
                        fixedWagerAmount: game.fixed_wager_amount,
                        eventName: game.event.name,
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
            const teamdata = teamseasons[participant.teamseason];
            output[participant.game].matchup[id] = {
                picks: [],
                teamName: teamdata.team, 
                rank: teamdata.rank,
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
            if(wager.user === user) {
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

export const selectMapGamesToWinners = createSelector(
    [selectWinners, selectParticipants],
    (winners, participants) => {
        var out = {};
        forOwn(winners, (winner) => {
            if(winner.participant in participants) {
                out[participants[winner.participant].game] = parseInt(winner.participant, 10);
            }
        });
        return out;
    }
);

export const selectWinningParticipantSet = createSelector(
    [selectWinners],
    (winners) => {
        var output = new Set();
        forOwn(winners, (winner) => {
            output.add(winner.participant);
        });
        return output;
    }
);

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
const selectAllPicksForCurrentSeason = (state) => {
    // TODO: Refactor to avoid this deep copy by making other 2 functions
    // pure
    var games = cloneDeep(selectAllGamesWithWagersForCurrentSeason(state));
    selectAllSelectionsForGames(state, games);
    return games;
}

const createFixedWagerForAllPicks = (amount, picks) => {
    var output = {};
    picks.forEach((id) =>  {
        output[id] = amount;
    });
    return output;
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
        'selections',
        'seasons',
        'winners',
    ];
    return APIDataIsReadyForSeason(state, required, season);
}

export const collectAndTransformPicksForSeason = (state, season) => {
    if (!stateIsReadyForPicksPage(state, season)) {
        return [];
    }
    const gamedata = selectAllPicksForCurrentSeason(state);
    var output = []
    forOwn(gamedata, (data, id) => {
        const [partid1, partid2] = keys(data.matchup);
        const leftMatchup = data.matchup[partid1];
        const rightMatchup = data.matchup[partid2];
        const wagers = data.gameDetails.fixedWagerAmount ?
            createFixedWagerForAllPicks(data.gameDetails.fixedWagerAmount,
                leftMatchup.picks.concat(rightMatchup.picks)) : data.wagers;
        output.push({
            id: parseInt(id, 10),
            gameDetails: data.gameDetails,
            left: {
                id: parseInt(partid1, 10),
                picks: zipWagersToPicks(state, wagers, leftMatchup.picks),
                teamName: leftMatchup.teamName,
            },
            right: {
                id: parseInt(partid2, 10),
                picks: zipWagersToPicks(state, wagers, rightMatchup.picks),
                teamName: rightMatchup.teamName,
            },
        });
    });
    sortTransformedPicksByDate(output);
    return output;
}

export const selectCurrentStartTime = createSelector(
    [selectCurrentSeason, selectSeasons],
    (currentSeason, seasons) => {
        if(!seasons) {
            return null;
        }
        return seasons[currentSeason].start_time;
    }
);

export const pickemHasStarted = createSelector(
    [selectCurrentStartTime],
    (startTime) => {
        if(startTime === null) {
            return false;
        }
        return Date.now() > new Date(startTime);
    }
);

export const selectProgressForCurrentSeason = createSelector(
    [selectCurrentSeason, selectProgress],
    (season, allProgress) => {
        var currentProgress = {}
        forOwn(allProgress, (progress, id) => {
            if (progress.season === season) {
                currentProgress[id] = {
                    ...progress
                }
            }
        });
        return currentProgress;
    }
);
