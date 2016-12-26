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
    loadPickemSeasons,
    pickemAuthLogin,
} from '../actions';
import {
    collectAndTransformPicksForSeason,
    stateIsReadyForPicksPage,
    selectCurrentStartTime,
    selectCurrentSeason,
} from '../Selectors/index';
import PicksPage from '../Components/PicksPage';
import LoadingSpinner from '../Components/LoadingSpinner';
import PreStartPickProgress from '../Components/PreStartPickProgress';

class ViewPicksPage extends Component {
    static propTypes = {
        dispatch: React.PropTypes.func.isRequired,
        season: React.PropTypes.number.isRequired,
        ready: React.PropTypes.bool.isRequired,
        matchupPicks: React.PropTypes.array.isRequired,
        pickemHasStarted: React.PropTypes.bool.isRequired,
        startTime: React.PropTypes.object.isRequired,
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
    }

    render() {
        const {
            matchupPicks,
            ready,
            pickemHasStarted,
            startTime,
        } = this.props;
        if (!ready) {
            return <LoadingSpinner />
        }
        if (!pickemHasStarted) {
            return <PreStartPickProgress startTime={ startTime } />;
        }
        return <PicksPage matchupPicks={matchupPicks} />;
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

const pickemHasStarted = (state) => {
    const start_time = selectCurrentStartTime(state);
    if(start_time === null) {
        return false;
    }
    console.log(Date.now());
    console.log(start_time);
    return Date.now() > new Date(start_time);
}

const mapStateToProps = (state) => {
    const currentSeason = selectCurrentSeason(state);
    return {
        //matchupPicks: sampleData, //selectAllPicksForSeason(state, season),
        matchupPicks: collectAndTransformPicksForSeason(state, currentSeason),
        ready: stateIsReadyForPicksPage(state, currentSeason),
        pickemHasStarted: pickemHasStarted(state),
        season: currentSeason,
        startTime: selectCurrentStartTime(state),
    }
}

export default connect(mapStateToProps)(ViewPicksPage);
