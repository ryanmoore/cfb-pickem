import PropTypes from 'prop-types';
import React, {
    Component
} from 'react';
import { connect } from 'react-redux';
import { Link } from 'react-router-dom';
import { selectSeasons } from '../Selectors';
import HistoryPage from '../Components/HistoryPage';
import forOwn from 'lodash/forOwn';
import { loadPickemSeasons } from '../actions';

const createLinkFromSeason = (season) => {
    return ({
        link: <Link key={season.id}
            to={`/${season.year}`}
            className='list-group-item'>{season.year}</Link>,
        id: season.id,
        year: season.year,
    });
}

const createSeasonLinks = (seasons) => {
    var arr = [];
    forOwn(seasons, (season) => { arr.push(createLinkFromSeason(season)) });
    arr.sort((a, b) => {
        if(a.year < b.year) return 1;
        if(a.year > b.year) return -1;
        return 0;
    });
    return arr;
}

class ViewHistoryPage extends Component {
    static propTypes = {
        dispatch: PropTypes.func.isRequired,
        seasons: PropTypes.arrayOf(PropTypes.object.isRequired),
    }

    componentDidMount() {
        const {
            dispatch,
        } = this.props;
        dispatch(loadPickemSeasons());
    }

    render() {
        const {
            seasons,
        } = this.props;
        return (
            <HistoryPage seasons={seasons} />
        );
    }
}

const mapStateToProps = (state) => ({
    seasons: createSeasonLinks(selectSeasons(state)),
});

export default connect(mapStateToProps)(ViewHistoryPage);
