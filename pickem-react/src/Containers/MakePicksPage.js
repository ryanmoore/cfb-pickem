import React, {
    Component
} from 'react';
import {
    connect
} from 'react-redux';
import {
    setMatchupPreview,
    swapMatchupOrder,
    makePick,
    setInitialPicks,
    setInitialMatchupOrdering,
    submitPicksAndWagers,
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
    selectGamesForCurrentSeason,
    selectGamesWithParticipantsForCurrentSeason,
    selectWagersForCurrentUser,
    selectAllSelectionsForCurrentUser,
    selectMatchupOrdering,
    selectCurrentUIPicks,
    APIDataIsReadyForSeason,
    selectCurrentSeason,
} from '../Selectors/index';
import forOwn from 'lodash/forOwn';
import keys from 'lodash/keys';
import cloneDeep from 'lodash/cloneDeep';
import Set from 'es6-set';
import { createSelector } from 'reselect';
import LoadingSpinner from '../Components/LoadingSpinner';
import { Grid, Row, Col, Button } from 'react-bootstrap';

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

const computeMatchupOrderingForCurrentUser = createSelector(
    [selectGamesForCurrentSeason, selectWagersForCurrentUser],
    (games, wagers) => {
        var output = new Array();
        var picked = new Set();
        forOwn(wagers, (wager) => {
            if(wager.game in games) {
                // We subtract 1 to index the array from 0
                output[wager.amount-1] = wager.game;
                picked.add(wager.game);
            }
        });
        var i = 0;
        forOwn(games, (game, id) => {
            const intId = parseInt(id, 10);
            if(!picked.has(intId) && game.gameDetails.fixedWagerAmount === 0) {
                while(output[i]) {
                    i += 1;
                }
                output[i] = intId;
            }
        });
        return output;
    }
);

const selectMatchupOrderingForCurrentUser = createSelector(
    [selectMatchupOrdering, computeMatchupOrderingForCurrentUser],
    (uiMatchupOrdering, computedMatchupOrdering) => {
        const uiOrdering = uiMatchupOrdering;
        if(uiOrdering.length) {
            return uiOrdering;
        }
        return computedMatchupOrdering;
    }
);

const selectAndArrangePicksForCurrentUserAndSeason = createSelector(
    [selectAllPicksForCurrentUserAndSeason, selectCurrentUIPicks],
    (pickdata, selections) => {
        var fixed = {};
        var wagered = {};
        forOwn(pickdata, (gameinfo, id) => {
            const [partid1, partid2] = keys(gameinfo.matchup);
            const leftPart = gameinfo.matchup[partid1];
            const rightPart = gameinfo.matchup[partid2];
            var out = gameinfo.gameDetails.fixedWagerAmount ? fixed : wagered;
            out[id] = new MatchupData(parseInt(id, 10), gameinfo.gameDetails.eventName,
                new PickData(parseInt(partid1, 10),leftPart.teamName,
                    leftPart.rank, parseInt(partid1, 10) === gameinfo.selection),
                new PickData(parseInt(partid2, 10),rightPart.teamName,
                    leftPart.rank, parseInt(partid2, 10) === gameinfo.selection),
                gameinfo.gameDetails.fixedWagerAmount,
            );
        });
        return {fixed, wagered};
    }
);

const selectAllMatchupDataForCurrentUserAndSeason = createSelector(
    [selectAndArrangePicksForCurrentUserAndSeason,
        selectMatchupOrderingForCurrentUser],
    (pickdata, ordering) => {
        var fixed = [];
        forOwn(pickdata.fixed, (data) => {
            fixed.push(data);
        });
        return { fixed: fixed,
            wagered: ordering.map((id) => pickdata.wagered[id])
        };
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
    const orderingIsReady = !!selectMatchupOrderingForCurrentUser(state).length;
    return APIDataIsReadyForSeason(state, required, season)
            && orderingIsReady;
}

const collectAndTransformMatchups = (state, user, season) => {
    if (!stateIsReadyForMakePicksPage(state, user, season)) {
        return { wagered: [], fixed: []};
    }
    return selectAllMatchupDataForCurrentUserAndSeason(state);
}

class MakePicksPage extends Component {
    static propTypes = {
        dispatch: React.PropTypes.func.isRequired,
        season: React.PropTypes.number.isRequired,
        loading: React.PropTypes.bool.isRequired,
        matchups: React.PropTypes.shape({
            fixed: React.PropTypes.array.isRequired,
            wagered: React.PropTypes.array.isRequired,
        }).isRequired,
        moveMatchup: React.PropTypes.func.isRequired,
        setPreview: React.PropTypes.func.isRequired,
        makePick: React.PropTypes.func.isRequired,
        submitPickAndWagers: React.PropTypes.func.isRequired,
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
            makePick,
            setInitialMatchupOrdering,
            setInitialPicks,
            submitPickAndWagers,
        } = this.props;
        if (loading) {
            return (<LoadingSpinner />);
        }
        return (
            <Grid>
                <form>
                    <MatchupList wagered_matchups={matchups.wagered}
                        fixed_matchups={matchups.fixed}
                        moveMatchup={moveMatchup}
                        setPreview={setPreview}
                        previewIndex={previewIndex}
                        makePick={makePick}
                        setInitialMatchupOrdering={setInitialMatchupOrdering}
                        setInitialPicks={setInitialPicks}
                    />
                    <Row>
                        <Col>
                            <Button bsSize='large'
                                onClick={submitPickAndWagers}>
                                Save
                            </Button>
                        </Col>
                    </Row>
                </form>
            </Grid>
        );
    }
}

const mapStateToProps = (state) => {
    const currentUser = selectCurrentUser(state);
    const currentSeason = selectCurrentSeason(state);
    return {
        //matchups: getMatchupList(state.data.matchupOrders[state.ui.currentUser].ordering,
        //    state.data.matchups, state.data.teams),
        matchups: collectAndTransformMatchups(state, currentUser, currentSeason),
        previewIndex: state.ui.matchupPreview.previewIndex,
        loading: !stateIsReadyForMakePicksPage(state, currentUser, currentSeason),
        season: currentSeason,
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
        setInitialMatchupOrdering: (ordering) => {
            dispatch(setInitialMatchupOrdering(ordering))
        },
        setInitialPicks: (picks) => {
            dispatch(setInitialPicks(picks))
        },
        makePick: (game, participant) => {
            dispatch(makePick(game, participant))
        },
        submitPickAndWagers: () => {
            dispatch(submitPicksAndWagers())
        },
        dispatch,
    };
}

//const DisplayedMatchupList = connect(
//    mapStateToProps,
//    mapDispatchToProps
//)(MatchupList);

export default connect(mapStateToProps, mapDispatchToProps)(MakePicksPage);
