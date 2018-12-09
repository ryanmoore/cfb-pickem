import React, {
    Component
} from 'react';
import PropTypes from 'prop-types';
import {
    Grid,
    Row,
    Col,
    Alert,
} from 'react-bootstrap';
import moment from 'moment';

export default class PreStartPickProgress extends Component {
    static propTypes = {
        startTime: PropTypes.object.isRequired,
    };
    render() {
        const {
            startTime,
        } = this.props;
        return (
            <Grid>
                <Row>
                    <Col>
                        <Alert bsStyle='danger'>
                            <p>
                                Picks are secret until pickem starts. Check back after 
                                { ' '+moment(startTime).format('lll') }
                            </p>
                            <p>
                                You can view your picks at any time by using the
                                navigation bar and selecting <strong>Make Picks</strong>.
                            </p>
                        </Alert>
                    </Col>
                </Row>
            </Grid>
        );
    }
}
