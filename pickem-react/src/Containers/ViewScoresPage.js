import PropTypes from 'prop-types';
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
    loadPickemSeasons,
    loadPickemProgress,
} from '../actions';
import {
    collectAndTransformPicksForSeason,
    selectUsers,
    APIDataIsReadyForSeason,
    selectCurrentSeason,
    selectWinningParticipantSet,
    selectProgressForCurrentSeason,
    pickemHasStarted,
    selectGamesForCurrentSeason,
    selectCurrentStartTime,
} from '../Selectors/index';
import ScoresPage from '../Components/ScoresPage';
import PickProgressPage from '../Components/PickProgressPage';
import forOwn from 'lodash/forOwn';
import cloneDeep from 'lodash/cloneDeep';
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


const progressDataIsReady = (state, season) => {
    const required = [
        'games',
        'progress',
        'users',
        'seasons',
    ];
    return APIDataIsReadyForSeason(state, required, season);
}


class ViewProgressPage extends Component {
    static propTypes = {
        dispatch: PropTypes.func.isRequired,
        season: PropTypes.number.isRequired,
        progress: PropTypes.array.isRequired,
        loading: PropTypes.bool.isRequired,
        startTime: PropTypes.string.isRequired,
    }

    componentDidMount() {
        const {
            dispatch,
            season
        } = this.props;
        dispatch(loadPickemUsers());
        dispatch(loadPickemProgress(season));
        dispatch(loadPickemGames(season));
    }

    render() {
        const {
            progress,
            loading,
            startTime,
        } = this.props;
        if (loading) {
            return <LoadingSpinner />
        }
        return ( <PickProgressPage
            progress={progress}
            startTime={startTime}
            /> );
    }
}



class ViewStartedScoresPage extends Component {
    static propTypes = {
        dispatch: PropTypes.func.isRequired,
        season: PropTypes.number.isRequired,
        scores: PropTypes.array.isRequired,
        loading: PropTypes.bool.isRequired,
    }

    componentDidMount() {
        const {
            dispatch,
            season,
        } = this.props;
        dispatch(loadPickemUsers());
        dispatch(loadPickemGames(season));
        dispatch(loadPickemParticipants(season));
        dispatch(loadPickemTeamSeasons(season));
        dispatch(loadPickemWagers(season));
        dispatch(loadPickemSelections(season));
        dispatch(loadPickemWinners(season));
        dispatch(loadPickemSeasons(season));
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


class ViewScoresPage extends Component {
    static propTypes = {
        dispatch: PropTypes.func.isRequired,
        season: PropTypes.number.isRequired,
        scores: PropTypes.array.isRequired,
        progress: PropTypes.array.isRequired,
        loading: PropTypes.bool.isRequired,
        startTime: PropTypes.object.isRequired
    }

    componentDidMount() {
        const {
            dispatch,
            season
        } = this.props;
        dispatch(loadPickemSeasons(season));
    }

    render() {
        const {
            scores,
            loading,
            progress,
            started,
            season,
            dispatch,
            startTime,
        } = this.props;
        if(started) {
            return (<ViewStartedScoresPage
                dispatch={dispatch}
                scores={scores}
                season={season}
                loading={loading}
                />);
        } else {
            return (<ViewProgressPage
                progress={progress}
                season={season}
                loading={loading}
                dispatch={dispatch}
                startTime={startTime}
                />);
        }
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
            const [winners, _losersDummy, undecideds] = chooseWonLostUndecided(
                left, right, winnerParticipants);
            winners.forEach((winner) => {
                output[winner.id].score += winner.wager;
            });
            undecideds.forEach((undecided) => {
                output[undecided.id].remaining += undecided.wager;
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


const compareByUsername = (a, b) => {
    if(a.username < b.username) return 1;
    if(a.username > b.username) return -1;
    if(a.id < b.id) return 1;
    if(a.id > b.id) return -1;
    return 0;
}

const selectSortedProgress = createSelector(
    [selectUsers, selectProgressForCurrentSeason, selectGamesForCurrentSeason],
    (users, allProgress, games) => {
        const gameCount = Object.keys(games).length;
        var progressOutput = [];
        forOwn(allProgress, (progress, id) => {
            progressOutput.push({
                id: id,
                username: users[id].username,
                pickCount: progress.pick_count,
                picksNeeded: gameCount,
                percentComplete: progress.pick_count / gameCount,
            })
        });
        progressOutput.sort(compareByUsername);
        return progressOutput;
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
    const started = pickemHasStarted(state);
    const scores = !started || !scoreDataIsReady(state, currentSeason) ?
        [] : selectSortedNormalizedScores(state);
    const loading = started ?
        !scoreDataIsReady(state, currentSeason)
        : !progressDataIsReady(state, currentSeason);
    const progress = started || !progressDataIsReady(state, currentSeason) ?
        [] : selectSortedProgress(state);

    return {
        scores: scores,
        progress: progress,
        loading: loading,
        season: currentSeason,
        started: started,
        startTime: selectCurrentStartTime(state)
    }
}

export default connect(mapStateToProps)(ViewScoresPage);
