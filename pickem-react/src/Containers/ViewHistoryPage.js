import React from 'react';
import { connect } from 'react-redux';
import { Link } from 'react-router';
import { selectSeasons } from '../Selectors';
import HistoryPage from '../Components/HistoryPage';
import forOwn from 'lodash/forOwn';

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

const mapStateToProps = (state) => ({
    seasons: createSeasonLinks(selectSeasons(state)),
});

export default connect(mapStateToProps)(HistoryPage);
