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
    collectAndTransformPicksForSeason,
    stateIsReadyForPicksPage,
} from '../Selectors/index';
import PicksPage from '../Components/PicksPage';
import LoadingSpinner from '../Components/LoadingSpinner';

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
            return <LoadingSpinner />
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


const mapStateToProps = (state) => {
    return {
        //matchupPicks: sampleData, //selectAllPicksForSeason(state, season),
        matchupPicks: collectAndTransformPicksForSeason(state, 3),
        ready: stateIsReadyForPicksPage(state, 3),
        season: 3,
    }
}

export default connect(mapStateToProps)(ViewPicksPage);
