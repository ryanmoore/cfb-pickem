import React, {
    Component
} from 'react';
import {
    connect
} from 'react-redux';
import {
    setMatchupPreview,
    swapMatchupOrder,
    loadPickemGames,
    loadPickemUsers,
    loadPickemParticipants,
    loadPickemTeamSeasons,
    loadPickemSelections,
    loadPickemWagers,
} from '../actions';
import MatchupList from '../Components/MatchupList';
import {
    MatchupData,
    PickData
} from '../Components/Matchup';
import {
    selectGamesForSeason,
    selectAllParticipantsForGames,
    APIDataIsReadyForSeason,
} from '../Selectors/index';
import forOwn from 'lodash/forOwn';
import keys from 'lodash/keys';

const selectWagersForUser = (state, user, games) => {
    forOwn(state.entities.wagers, (wager) => {
        if (wager.user === user && wager.game in games) {
            games[wager.game].wager = wager.amount;

        }
    });
}

const selectSelectionsForUser = (state, user, games) => {
    forOwn(state.entities.selections, (selection) => {
        if (selection.user === user) {
            const participant = state.entities.participants[selection.participant];
            if (participant.game in games) {
                games[participant.game].selection = participant.id;
            }
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
//          wager: <amount>,
//          matchup: {
//              <participant id>: {
//                  teamName: <str>,
//              }
//          }
//          selection: <participant id>,
//      }
//      ...
// }

const selectMatchupDataForUser = (state, user, season) => {
    var games = selectGamesForSeason(state, season);
    selectAllParticipantsForGames(state, games);
    selectWagersForUser(state, user, games);
    selectSelectionsForUser(state, user, games);
    return games;
}

const selectMatchupOrdering = (state, user) => {
    return state.ui.makePicksOrdering.matchupOrders[user];
}

const transformMatchups = (state, user, data) => {
    var arranged = {};
    forOwn(data, (gameinfo, id) => {
        const [partid1, partid2] = keys(gameinfo.matchup);
        const leftPart = gameinfo.matchup[partid1];
        const rightPart = gameinfo.matchup[partid2];
        arranged[id] = new MatchupData(parseInt(id, 10), gameinfo.gameDetails.eventName,
            new PickData(parseInt(partid1, 10), leftPart.teamName, '?', leftPart.id === gameinfo.selection),
            new PickData(parseInt(partid2, 10), rightPart.teamName, '?', rightPart.id === gameinfo.selection),
        );
    });
    return selectMatchupOrdering(state, user).map((id) => arranged[id]);
}

const stateIsReadyForMakePicksPage = (state, user, season) => {
    const required = [
        'participants',
        'teamseasons',
        'wagers',
        'games',
        'users',
        'selections'
    ];
    const orderingIsReady = !!selectMatchupOrdering(state, user);
    return APIDataIsReadyForSeason(state, required, season)
            && orderingIsReady;
}

const collectAndTransformMatchups = (state, user, season) => {
    if (!stateIsReadyForMakePicksPage(state, user, season)) {
        return [];
    }
    const data = selectMatchupDataForUser(state, user, season);
    return transformMatchups(state, user, data);
}

class DisplayedMatchupList extends Component {
    static propTypes = {
        dispatch: React.PropTypes.func.isRequired,
        season: React.PropTypes.number.isRequired,
        loading: React.PropTypes.bool.isRequired,
        matchups: React.PropTypes.array.isRequired,
        moveMatchup: React.PropTypes.func.isRequired,
        setPreview: React.PropTypes.func.isRequired,
        previewIndex: React.PropTypes.number,
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
            matchups,
            loading,
            moveMatchup,
            setPreview,
            previewIndex,
        } = this.props;
        if (loading) {
            return <div>Loading...</div>;
        }
        return <MatchupList matchups={matchups}
                moveMatchup={moveMatchup}
                setPreview={setPreview}
                previewIndex={previewIndex}
            />
    }
}

const selectCurrentUser = (state) => {
    return state.ui.makePicksOrdering.currentUser;
}

const mapStateToProps = (state) => {
    const currentUser = selectCurrentUser(state);
    return {
        //matchups: getMatchupList(state.data.matchupOrders[state.ui.currentUser].ordering,
        //    state.data.matchups, state.data.teams),
        matchups: collectAndTransformMatchups(state, currentUser, 3),
        previewIndex: state.ui.matchupPreview.previewIndex,
        loading: !stateIsReadyForMakePicksPage(state, currentUser, 3),
        season: 3,
    };
}

const mapDispatchToProps = (dispatch) => {
    return {
        moveMatchup: (id, src, dst) => {
            dispatch(swapMatchupOrder(id, src, dst))
        },
        setPreview: (dst) => {
            dispatch(setMatchupPreview(dst))
        },
        dispatch: dispatch,
    };
}

//const DisplayedMatchupList = connect(
//    mapStateToProps,
//    mapDispatchToProps
//)(MatchupList);

export default connect(mapStateToProps, mapDispatchToProps)(DisplayedMatchupList);
