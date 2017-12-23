import React, {
    Component
} from 'react';
import {
    Grid,
} from 'react-bootstrap';
import PickProgressTableRow from '../Components/PickProgressTableRow';

export default class PickProgressTable extends Component {
    static propTypes = {
        scores: React.PropTypes.arrayOf(
            React.PropTypes.shape({
                id: React.PropTypes.number.isRequired,
                username: React.PropTypes.string.isRequired,
                pickCount: React.PropTypes.number.isRequired,
                picksNeeded: React.PropTypes.number.isRequired,
                percentComplete: React.PropTypes.number.isRequired,
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
