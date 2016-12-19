import React, {
    Component
} from 'react';
import {
    connect
} from 'react-redux';
import {
    loadPickemGames,
    loadPickemUsers,
    loadPickemParticipants,
    loadPickemTeamSeasons,
    loadPickemSelections,
    loadPickemWagers,
} from '../actions';
import {
    selectGamesForSeason,
    selectAllParticipantsForGames,
    APIDataIsReadyForSeason,
} from '../Selectors/index';
import PicksPage from '../Components/PicksPage';
import forOwn from 'lodash/forOwn';
import keys from 'lodash/keys';

class ViewPicksPage extends Component {
    static propTypes = {
        dispatch: React.PropTypes.func.isRequired,
        season: React.PropTypes.number.isRequired,
        ready: React.PropTypes.bool.isRequired,
        matchupPicks: React.PropTypes.array.isRequired,
    }

    componentDidMount() {
        const {
            dispatch,
            season
        } = this.props;
        dispatch(loadPickemUsers());
        dispatch(loadPickemGames(season));
        dispatch(loadPickemParticipants(season));
        dispatch(loadPickemTeamSeasons(season));
        dispatch(loadPickemWagers(season));
        dispatch(loadPickemSelections(season));
    }

    render() {
        const {
            matchupPicks,
            ready
        } = this.props;
        if (!ready) {
            return null;
        }
        return <PicksPage matchupPicks={matchupPicks} />;
    }
}

const selectAllWagersForGames = (state, games) => {
    forOwn(games, (game) => {
        game.wagers = {};
    });
    forOwn(state.entities.wagers, (wager) => {
        if (wager.game in games) {
            games[wager.game].wagers[wager.user] = wager.amount;
        }
    });
}

const selectUsernameFromId = (state, id) => {
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
    var games = selectGamesForSeason(state, season);
    selectAllParticipantsForGames(state, games);
    selectAllWagersForGames(state, games);
    selectAllSelectionsForGames(state, games);
    return games;
}

const zipWagersToPicks = (state, wagers, picks) => {
    return picks.map((id) => {
        return {
            username: selectUsernameFromId(state, id),
            wager: wagers[id]
        }
    });
}

const stateIsReadyForPicksPage = (state, season) => {
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

const sortTransformedPicksByDate = (arr) => {
    const getDate = (elt) => elt.gameDetails.date;
    arr.sort((a, b) => {
        if (getDate(a) < getDate(b)) return -1;
        if (getDate(a) > getDate(b)) return 1;
        return 0
    });

}

const collectAndTransformPicksForSeason = (state, season) => {
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
                picks: zipWagersToPicks(state, data.wagers, leftMatchup.picks),
                teamName: leftMatchup.teamName,
            },
            right: {
                picks: zipWagersToPicks(state, data.wagers, rightMatchup.picks),
                teamName: rightMatchup.teamName,
            },
        });
    });
    sortTransformedPicksByDate(output);
    return output;
}

// const sampleData = [{
//     left: {
//         picks: [{
//             username: 'Ryan',
//             wager: 1
//         }],
//         teamName: 'Left1'
//     },
//     right: {
//         picks: [{
//             username: 'Dan',
//             wager: 2
//         }],
//         teamName: 'Right1'
//     },
//     gameDetails: {
//         eventName: 'Game1',
//         date: new Date(Date.now())
//     },
//     id: 1,
// }];


const mapStateToProps = (state) => {
    return {
        //matchupPicks: sampleData, //selectAllPicksForSeason(state, season),
        matchupPicks: collectAndTransformPicksForSeason(state, 3),
        ready: stateIsReadyForPicksPage(state, 3),
        season: 3,
    }
}

export default connect(mapStateToProps)(ViewPicksPage);
