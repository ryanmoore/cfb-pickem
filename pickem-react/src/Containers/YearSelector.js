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
} from '../actions';

class YearSelector extends Component {
    static propTypes = {
        params: React.PropTypes.shape({
            year: React.PropTypes.string.isRequired,
        }),
        dispatch: React.PropTypes.func.isRequired,
        children: React.PropTypes.node,
    }

    componentDidMount() {
        const { dispatch, params } = this.props;
        const { year } = params;
        dispatch(setSelectedSeason(parseInt(year, 10)));
    }

    render() {
        return (
            <div>
                { this.props.children }
            </div>
        );
    }
}

export default connect(null, null)(YearSelector);
