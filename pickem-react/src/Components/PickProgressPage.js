import PropTypes from 'prop-types';
import React, {
    Component
} from 'react';
import './PickProgressTableRow.css';
import {
    Grid,
    Panel,
    Row,
    PageHeader,
} from 'react-bootstrap';
import PickProgressTable from './PickProgressTable';
import moment from 'moment';

export default class PickProgressPage extends Component {
    static propTypes = {
        progress: PropTypes.array.isRequired,
        startTime: PropTypes.object.isRequired,
    };

    render() {
        const {
            progress,
            startTime
        } = this.props;
        const header = 'Scores not yet available'
        return (
            <Grid>
                <Row>
                    <Panel bsStyle='warning' header={header}>
                        Scores will be viewable when this year's pickem
                        starts. The start time is: {moment(startTime).format('lll')}
                    </Panel>
                </Row>
                <Row>
                    <PageHeader>
                        Pick Progress
                    </PageHeader>
                </Row>
                <PickProgressTable progress={progress} />
            </Grid>
        );
    }
}
