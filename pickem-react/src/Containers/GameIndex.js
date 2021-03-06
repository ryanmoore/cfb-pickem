import React, {
    Component
} from 'react';
import PropTypes from 'prop-types';
import {
    connect
} from 'react-redux';
import {
    loadPickemGames,
} from '../actions';
import {
    selectCurrentSeason,
    selectGamesForCurrentSeason,
} from '../Selectors/index';
import GameTable from '../Components/GameTable';
import forOwn from 'lodash/forOwn';

const sortDatesMostRecentFirst = (arr) => {
    arr.sort((a, b) => {
        if (a.date < b.date) return -1;
        if (a.date > b.date) return 1;
        return 0
    });
}

const getGameList = (games) => {
    if (!games) {
        return [];
    }
    var display = [];
    forOwn(games, (game, id) => {
        display.push({
            id: id,
            date: game.gameDetails.date,
            name: game.gameDetails.eventName,
        });
    });
    sortDatesMostRecentFirst(display);
    return display;
}

class GameIndex extends Component {
    static propTypes = {
        dispatch: PropTypes.func.isRequired,
        season: PropTypes.number.isRequired,
        games: PropTypes.array.isRequired,
        ready: PropTypes.bool.isRequired,
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
        games: getGameList(selectGamesForCurrentSeason(state)),
        season: selectCurrentSeason(state),
        ready: !!state.entities.games,
    }
}

export default connect(mapStateToProps)(GameIndex);
