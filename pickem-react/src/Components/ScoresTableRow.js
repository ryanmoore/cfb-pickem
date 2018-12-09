import PropTypes from 'prop-types';
import React, {
    Component
} from 'react';
import {
    Row,
    Col,
    ProgressBar,
} from 'react-bootstrap';
import './ScoresTableRow.css';

export default class ScoresTableRow extends Component {
    static propTypes = {
        name: PropTypes.string.isRequired,
        score: PropTypes.number.isRequired,
        remainder: PropTypes.number.isRequired,
        achievedPercent: PropTypes.number.isRequired,
        remainderPercent: PropTypes.number.isRequired,
    };
    render() {
        const {
            name,
            score,
            remainder,
            achievedPercent,
            remainderPercent
        } = this.props;
        const scoreLabelWidth = 10;
        const achievedShare = achievedPercent*80;
        const remainderShare = remainderPercent*80;
        const leftover = 100 - scoreLabelWidth - achievedShare - remainderShare;
        return (
            <Row>
                <Col xs={2} className='score-username'>{ name } </Col>
                <Col xs={8}>
                    <ProgressBar>
                        <ProgressBar key={1} className='score-label' now={scoreLabelWidth} label={score}/>
                        <ProgressBar key={2} now={achievedShare}/>
                        <ProgressBar key={3} bsStyle='success' now={remainderShare}/>
                        <ProgressBar key={4} className='score-label remainder-bar'
                            now={leftover} label={`${remainder}\u00a0`}/>
                    </ProgressBar>
                </Col>
                <Col xs={2} className='totals'>{ score + remainder }</Col>
            </Row>
        );
    }
}
