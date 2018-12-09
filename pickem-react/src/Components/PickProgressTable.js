import PropTypes from 'prop-types';
import React, {
    Component
} from 'react';
import {
    Grid,
} from 'react-bootstrap';
import PickProgressTableRow from '../Components/PickProgressTableRow';

export default class PickProgressTable extends Component {
    static propTypes = {
        scores: PropTypes.arrayOf(
            PropTypes.shape({
                id: PropTypes.number.isRequired,
                username: PropTypes.string.isRequired,
                pickCount: PropTypes.number.isRequired,
                picksNeeded: PropTypes.number.isRequired,
                percentComplete: PropTypes.number.isRequired,
            })
        ).isRequired,
    };
    render() {
        const {
            progress
        } = this.props;
        const progressBars = progress.map((element) => {
            return <PickProgressTableRow 
                    key={element.id}
                    username={element.username}
                    pickCount={element.pickCount}
                    picksNeeded={element.picksNeeded}
                    percentComplete={element.percentComplete}
                />
        });
        return (<Grid>{progressBars}</Grid>);
    }
}
