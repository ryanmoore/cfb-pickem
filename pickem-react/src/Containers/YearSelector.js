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
import LoadingSpinner from '../Components/LoadingSpinner';

class YearSelector extends Component {
    static propTypes = {
        params: React.PropTypes.shape({
            year: React.PropTypes.string.isRequired,
        }),
        dispatch: React.PropTypes.func.isRequired,
        children: React.PropTypes.node,
        selectedYear: React.PropTypes.number,
        selectedSeason: React.PropTypes.number,
    }

    componentDidMount() {
        const { dispatch, params } = this.props;
        const { year } = params;
        dispatch(setSelectedSeason(parseInt(year, 10)));
        dispatch(loadPickemSeasons());
    }

    render() {
        const { selectedYear, selectedSeason, params } = this.props;
        const year = parseInt(params.year, 10);
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
