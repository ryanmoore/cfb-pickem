import React, {
    Component
} from 'react';
import {
    Row,
    Col,
    ProgressBar,
} from 'react-bootstrap';
import './PickProgressTableRow.css';

export default class ScoresTableRow extends Component {
    static propTypes = {
        id: React.PropTypes.number.isRequired,
        username: React.PropTypes.string.isRequired,
        pickCount: React.PropTypes.number.isRequired,
        picksNeeded: React.PropTypes.number.isRequired,
        percentComplete: React.PropTypes.number.isRequired,
    };
    render() {
        const {
            username,
            pickCount,
            picksNeeded,
            percentComplete,
            done,
        } = this.props;
        const labelWidth = 10;
        const completionBarWidth = 90*percentComplete;
        const color = done ? 'success' : 'warning';
        const picksRemaining = picksNeeded - pickCount;
        return (
            <Row>
                <Col xs={2} className='username'>{ username } </Col>
                <Col xs={10}>
                    <ProgressBar>
                        <ProgressBar key={1} className='count-label' now={labelWidth} label={pickCount}/>
                        <ProgressBar key={2} bsStyle={color} now={completionBarWidth}/>
                    </ProgressBar>
                </Col>
            </Row>
        );
    }
}
