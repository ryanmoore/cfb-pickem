import PropTypes from 'prop-types';
import React, {
    Component
} from 'react';
import {
    connect,
} from 'react-redux';
import {
    createSelector
} from 'reselect';
import {
    setSelectedSeason,
    loadPickemSeasons,
} from '../actions';
import {
    selectCurrentYear,
    selectCurrentSeason,
} from '../Selectors';
import PageNotFound from '../Components/PageNotFound';
import LoadingSpinner from '../Components/LoadingSpinner';

class YearSelector extends Component {
    static propTypes = {
        match: PropTypes.shape({
            params: PropTypes.shape({
                year: PropTypes.string.isRequired,
            }),
        }),
        dispatch: PropTypes.func.isRequired,
        children: PropTypes.node,
        selectedYear: PropTypes.number,
        selectedSeason: PropTypes.number,
    }

    componentDidMount() {
        const { dispatch, match } = this.props;
        const { year } = match.params;
        const yearInt = parseInt(year, 10);
        if(!isNaN(yearInt) && yearInt !== this.props.selectedYear) {
            dispatch(setSelectedSeason(yearInt));
        }
        dispatch(loadPickemSeasons());
    }

    componentWillReceiveProps(nextProps) {
        const { dispatch } = this.props;
        const nextYear = nextProps.match.params.year;
        const curYear = this.props.selectedYear;
        const nextYearInt = parseInt(nextYear, 10);
        if(nextYear !== null
            && !isNaN(nextYearInt)
            && curYear !== nextYearInt
            && nextYearInt !== parseInt(this.props.match.params.year, 10)
        ) {
            dispatch(setSelectedSeason(nextYearInt));
        }
    }

    render() {
        const { selectedYear, selectedSeason, match } = this.props;
        const year = parseInt(match.params.year, 10);
        if(isNaN(year)) {
            return <PageNotFound />;
        }
        // Do not render other elements until the year in the store matches
        // our year
        if(!selectedYear
            || selectedSeason === null
            || typeof(selectedYear) === 'undefined'
            || selectedYear !== year) {
            return <LoadingSpinner />;
        }
        return (
            <div>
                { this.props.children }
            </div>
        );
    }
}

const mapStateToProps = (state) => ({
    selectedYear: selectCurrentYear(state),
    selectedSeason: selectCurrentSeason(state),
});

export default connect(mapStateToProps, null)(YearSelector);
