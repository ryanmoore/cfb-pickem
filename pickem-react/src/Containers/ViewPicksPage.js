import React, {
    Component
} from 'react';
import PropTypes from 'prop-types';
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
    loadPickemSeasons,
    loadPickemWinners,
} from '../actions';
import {
    collectAndTransformPicksForSeason,
    stateIsReadyForPicksPage,
    selectCurrentStartTime,
    selectCurrentSeason,
    selectMapGamesToWinners,
    pickemHasStarted,
} from '../Selectors/index';
import PicksPage from '../Components/PicksPage';
import LoadingSpinner from '../Components/LoadingSpinner';
import PreStartPickProgress from '../Components/PreStartPickProgress';
import forOwn from 'lodash/forOwn';
import cloneDeep from 'lodash/cloneDeep';

class ViewPicksPage extends Component {
    static propTypes = {
        dispatch: PropTypes.func.isRequired,
        season: PropTypes.number.isRequired,
        ready: PropTypes.bool.isRequired,
        matchupPicks: PropTypes.array.isRequired,
        pickemHasStarted: PropTypes.bool.isRequired,
        startTime: PropTypes.object.isRequired,
        admin: PropTypes.bool,
        AdminButton: PropTypes.element,
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
        dispatch(loadPickemSeasons());
        dispatch(loadPickemWinners());
    }

    render() {
        const {
            matchupPicks,
            ready,
            pickemHasStarted,
            startTime,
            admin,
            AdminButton,
        } = this.props;
        if (!ready) {
            return <LoadingSpinner />
        }
        if (!pickemHasStarted) {
            return <PreStartPickProgress startTime={ startTime } />;
        }
        return (<PicksPage matchupPicks={matchupPicks}
                        admin={admin}
                        AdminButton={AdminButton}/>);
    }
}


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

const addAllWinnersToGames = (state, gamedata) => {
    var data = cloneDeep(gamedata);
    const winners = selectMapGamesToWinners(state);
    forOwn(data, (game) => {
        if(game.id in winners) {
            game.winner = winners[game.id];
        }
    });
    return data;
}

const getAllMatchupData = (state) => {
    const gamedata = collectAndTransformPicksForSeason(state,
        selectCurrentSeason(state));
    return addAllWinnersToGames(state, gamedata);
}

const mapStateToProps = (state) => {
    const currentSeason = selectCurrentSeason(state);
    return {
        //matchupPicks: sampleData, //selectAllPicksForSeason(state, season),
        matchupPicks: getAllMatchupData(state),
        ready: stateIsReadyForPicksPage(state, currentSeason),
        pickemHasStarted: pickemHasStarted(state),
        season: currentSeason,
        startTime: new Date(selectCurrentStartTime(state)),
    }
}

export default connect(mapStateToProps)(ViewPicksPage);
