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

class GameIndex extends Component {
    static propTypes = {
        dispatch: React.PropTypes.func.isRequired,
        season: React.PropTypes.number.isRequired,
        games: React.PropTypes.array.isRequierd,
        ready: React.PropTypes.bool.isRequired,
    }
    constructor(props) {
        super(props);
    }

    componentDidMount() {
        const {
            dispatch,
            season
        } = this.props;
        dispatch(loadPickemGames(season));
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
        season: 3,
        ready: !!state.entities.games,
    }
}

export default connect(mapStateToProps)(GameIndex);
