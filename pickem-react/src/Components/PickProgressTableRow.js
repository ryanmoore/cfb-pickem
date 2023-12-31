import PropTypes from 'prop-types';
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
        id: PropTypes.number.isRequired,
        username: PropTypes.string.isRequired,
        pickCount: PropTypes.number.isRequired,
        picksNeeded: PropTypes.number.isRequired,
        percentComplete: PropTypes.number.isRequired,
        done: PropTypes.bool.isRequired,
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
        // eslint-disable-next-line no-underscore-dangle
        const _picksRemaining = picksNeeded - pickCount;
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
