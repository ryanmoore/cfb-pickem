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
    selectParticipants,
    selectCurrentUser,
    selectGamesWithParticipantsForCurrentSeason,
    selectWagersForCurrentUser,
    selectAllSelectionsForCurrentUser,
    APIDataIsReadyForSeason,
} from '../Selectors/index';
import forOwn from 'lodash/forOwn';
import keys from 'lodash/keys';
import cloneDeep from 'lodash/cloneDeep';
import { createSelector } from 'reselect';

const selectAndTieWagersToGamesForCurrentSeason = createSelector(
    [selectGamesWithParticipantsForCurrentSeason,
        selectWagersForCurrentUser],
    (games, wagers) => {
        var output = cloneDeep(games);
        forOwn(wagers, (wager) => {
            if (wager.game in games) {
                output[wager.game].wager = wager.amount;
            } else {
                throw new Error('Wager not found in games');
            }
        });
        return output;
    }
);

const selectAllPicksForCurrentUserAndSeason = createSelector(
    [selectAndTieWagersToGamesForCurrentSeason,
        selectAllSelectionsForCurrentUser,
        selectParticipants],
    (gamedata, selections, participants) => {
        var output = cloneDeep(gamedata);
        forOwn(selections, (selection) => {
            const participant = participants[selection.participant];
            if (participant.game in gamedata) {
                output[participant.game].selection = participant.id;
            }
        });
        return output;
    }
);

const selectMatchupOrderings = (state) => state.ui.makePicksOrdering.matchupOrders;

const selectMatchupOrderingForGivenUser = (state, user) => {
    return selectMatchupOrderings(state)[user];
}

const selectMatchupOrderingForCurrentUser = createSelector(
    [selectCurrentUser, selectMatchupOrderings],
    (user, matchupOrderings) => {
        return matchupOrderings[user];
    }
);

const selectAndArrangePicksForCurrentUserAndSeason = createSelector(
    [selectAllPicksForCurrentUserAndSeason],
    (pickdata) => {
        var arranged = {};
        forOwn(pickdata, (gameinfo, id) => {
            const [partid1, partid2] = keys(gameinfo.matchup);
            const leftPart = gameinfo.matchup[partid1];
            const rightPart = gameinfo.matchup[partid2];
            arranged[id] = new MatchupData(parseInt(id, 10), gameinfo.gameDetails.eventName,
                new PickData(parseInt(partid1, 10), leftPart.teamName, '?', leftPart.id === gameinfo.selection),
                new PickData(parseInt(partid2, 10), rightPart.teamName, '?', rightPart.id === gameinfo.selection),
            );
        });
        return arranged;
    }
);

const selectAllMatchupDataForCurrentUserAndSeason = createSelector(
    [selectAndArrangePicksForCurrentUserAndSeason,
        selectMatchupOrderingForCurrentUser],
    (pickdata, ordering) => {
        return ordering.map((id) => pickdata[id]);
    }
)

const stateIsReadyForMakePicksPage = (state, user, season) => {
    const required = [
        'participants',
        'teamseasons',
        'wagers',
        'games',
        'users',
        'selections'
    ];
    const orderingIsReady = !!selectMatchupOrderingForGivenUser(state, user);
    return APIDataIsReadyForSeason(state, required, season)
            && orderingIsReady;
}

const collectAndTransformMatchups = (state, user, season) => {
    if (!stateIsReadyForMakePicksPage(state, user, season)) {
        return [];
    }
    return selectAllMatchupDataForCurrentUserAndSeason(state);
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
