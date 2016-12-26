import React, {
    Component
} from 'react';
import {
    connect
} from 'react-redux';
import {
    createSelector
} from 'reselect';
import {
    loadPickemGames,
    loadPickemUsers,
    loadPickemParticipants,
    loadPickemTeamSeasons,
    loadPickemSelections,
    loadPickemWagers,
    loadPickemWinners,
} from '../actions';
import {
    collectAndTransformPicksForSeason,
    selectUsers,
    selectWinners,
    APIDataIsReadyForSeason,
    selectCurrentSeason,
    selectWinningParticipantSet,
} from '../Selectors/index';
import ScoresPage from '../Components/ScoresPage';
import forOwn from 'lodash/forOwn';
import cloneDeep from 'lodash/cloneDeep';
import Set from 'es6-set';
import LoadingSpinner from '../Components/LoadingSpinner';

const scoreDataIsReady = (state, season) => {
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

class ViewScoresPage extends Component {
    static propTypes = {
        dispatch: React.PropTypes.func.isRequired,
        season: React.PropTypes.number.isRequired,
        scores: React.PropTypes.array.isRequired,
        loading: React.PropTypes.bool.isRequired,
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
        dispatch(loadPickemWinners(season));
    }

    render() {
        const {
            scores,
            loading,
        } = this.props;
        if (loading) {
            return <LoadingSpinner />
        }
        return ( <ScoresPage scores={scores} /> );
    }
}

// create a set of winning participants
// create a set of losing participants
//
// for each user, create a set of won games and lost games
//
// reduce wagers into (wonPoints, availablePoints) where:
//      wonPoints is if the wager.game is in wonGames
//      and availablePoints is if the wager.game is in neither wonGames nor lostGames
//
// create a Set of won selections games
// create a Set of lost selections games
//
// const sampleData = [{
//     left: {
//         id,
//         picks: [{
//             id,
//             username: 'Ryan',
//             wager: 1
//         }],
//         teamName: 'Left1'
//     },
//     right: {
//         id,
//         picks: [{
//             id,
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

const chooseWonLostUndecided = (left, right, winners) => {
    if(winners.has(left.id)) {
        return [left.picks, right.picks, []];
    }
    else if(winners.has(right.id)) {
        return [right.picks, left.picks, []];
    }
    else {
        return [[], [], right.picks.concat(left.picks)];
    }
}

const wagerOrFixedWager = (wager) => {
    if(typeof(wager) === 'undefined') {
        console.log('TODO: Handle fixed wagers.');
        return 28;
    }
    return wager;
}

const computeScoresForAllUsers = createSelector(
    [selectUsers, collectAndTransformPicksForSeason, selectWinningParticipantSet],
    (users, picklist, winnerParticipants) => {
        var output = {};
        forOwn(users, (user, id) => {
            output[id] = {
                id,
                username: user.username,
                score: 0,
                remaining: 0,
            };
        });
        picklist.forEach(({left, right}) => {
            const [winners, losers, undecideds] = chooseWonLostUndecided(
                left, right, winnerParticipants);
            winners.forEach((winner) => {
                output[winner.id].score += wagerOrFixedWager(winner.wager);
            });
            undecideds.forEach((undecided) => {
                output[undecided.id].remaining += wagerOrFixedWager(undecided.wager);
            });
        });
        return output;
    }
);

const maxPossibleScore = (scores) => {
    var allTotals = []
    forOwn(scores, (score) => {
        allTotals.push(score.score + score.remaining);
    });
    return Math.max(...allTotals);
}

const computeNormalizeScores = createSelector(
    [computeScoresForAllUsers],
    (scores) => {
        var output = cloneDeep(scores);
        const maxScore = maxPossibleScore(scores);
        forOwn(output, (score) => {
            score.achievedPercent = maxScore ? score.score/maxScore : 0;
            score.remainderPercent = maxScore ? score.remaining/maxScore : 0;
        });
        return output;
    }
);

const compareByTotalScoreDecending = (a, b) => {
    const aTotal = a.score + a.remaining;
    const bTotal = b.score + b.remaining;
    if(aTotal < bTotal) return 1;
    if(aTotal > bTotal) return -1;
    if(a.name < b.name) return 1;
    if(a.name > b.name) return -1;
    return 0;
}

const selectSortedNormalizedScores = createSelector(
    [computeNormalizeScores],
    (scores) => {
        var scoresAsList = [];
        forOwn(scores, (score) => {
            scoresAsList.push(score);
        });
        scoresAsList.sort(compareByTotalScoreDecending);
        return scoresAsList;
    }
);

//const sampleScores = [{
//    name: 'Player1',
//    score: 10,
//    remainder: 40,
//    achievedPercent: 10,
//    remainderPercent: 40,
//}, {
//    name: 'Player2',
//    score: 20,
//    remainder: 40,
//    achievedPercent: 20,
//    remainderPercent: 40,
//}];


const mapStateToProps = (state) => {
    const currentSeason = selectCurrentSeason(state);
    return {
        scores: scoreDataIsReady(state, currentSeason) ? selectSortedNormalizedScores(state) : [],
        loading: !scoreDataIsReady(state, currentSeason),
        season: currentSeason,
    }
}

export default connect(mapStateToProps)(ViewScoresPage);
