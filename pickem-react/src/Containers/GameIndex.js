import {
    connect
} from 'react-redux';
import GameTable from '../Components/GameTable';
import {
    MatchupData,
    PickData
} from '../Components/Matchup';

// TODO: Reusing matchup info for now, but Game data should be collected
// differently
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
        games: getMatchupList(state.data.matchupOrders[state.ui.currentUser].ordering,
            state.data.matchups, state.data.teams),
    };
}

const GameIndex = connect(
    mapStateToProps
)(GameTable);

export default GameIndex;
