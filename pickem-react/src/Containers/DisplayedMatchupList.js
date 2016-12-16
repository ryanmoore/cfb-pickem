import {
    connect
} from 'react-redux';
import {
    setMatchupPreview,
    swapMatchupOrder
} from '../actions';
import MatchupList from '../Components/MatchupList';
import {
    MatchupData,
    PickData
} from '../Components/Matchup';

function createMatchupData(matchup, teams) {
    const left = teams[matchup.left];
    const right = teams[matchup.right];
    return new MatchupData(
        matchup.id,
        new PickData(left.id, left.name, left.rank),
        new PickData(right.id, right.name, right.rank)
    );
}

const getMatchupList = (ordering, matchups, teams) => {
    return ordering.map((idx) => createMatchupData(matchups[idx], teams));
}

const mapStateToProps = (state) => {
    return {
        matchups: getMatchupList(state.data.matchupOrders[state.ui.currentUser].ordering,
            state.data.matchups, state.data.teams),
        previewIndex: state.ui.previewIndex
    };
}

const mapDispatchToProps = (dispatch) => {
    return {
        moveMatchup: (id, src, dst) => {
            dispatch(swapMatchupOrder(id, src, dst))
        },
        setPreview: (dst) => {
            dispatch(setMatchupPreview(dst))
        }
    };
}

const DisplayedMatchupList = connect(
    mapStateToProps,
    mapDispatchToProps
)(MatchupList);

export default DisplayedMatchupList;
