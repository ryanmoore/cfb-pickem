import React, {
    Component
} from 'react';
import {
    connect
} from 'react-redux';
import {
    loadPickemGames
} from '../actions';
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


const getGameList = (games) => {
    if(!games) {
        return [];
    }
    var display = [];
    Object.keys(games).forEach((key) => {
        display.push({
            id: games[key].id,
            date: new Date(games[key].datetime),
            name: games[key].event
        });
    });
    return display;
}

//const mapStateToProps = (state) => {
//    return {
//        //games: getMatchupList(state.data.matchupOrders[state.ui.currentUser].ordering,
//        //    state.data.matchups, state.data.teams),
//    };
//}

class GameIndex extends Component {
    constructor(props) {
        super(props);
    }

    componentDidMount() {
        const {
            dispatch,
            year
        } = this.props;
        dispatch(loadPickemGames(year));
    }

    render() {
        const {
            games,
            ready
        } = this.props;
        if (!ready) {
            return null;
        }
        return (
            <GameTable games={games} />
        );
    }
}

const mapStateToProps = (state) => {
    return {
        games: getGameList(state.entities.games),
        year: 'TODO',
        ready: !!state.entities.games,
    }
}

//const GameIndex = connect(
//    mapStateToProps,
//    mapDispatchToProps
//)(GameTable);

export default connect(mapStateToProps)(GameIndex);
