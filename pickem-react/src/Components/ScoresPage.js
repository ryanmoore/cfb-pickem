import PropTypes from 'prop-types';
import React, {
    Component
} from 'react';
import './ScoresTableRow.css';
import {
    Grid,
    //Panel,
} from 'react-bootstrap';
import ScoresTable from './ScoresTable';

//class ScoreTableHelpHeader extends Component {
//    render() {
//        return (
//            <Panel bsStyle='info'>
//                <div className="panel-heading">
//                    <a data-toggle="collapse" href="#whats-this" aria-expanded="true" aria-controls="collapseOne">
//                        What's this?
//                    </a>
//                </div>
//                <div className="panel-body collapse example-panel" id="whats-this">
//                    <div className="example-label" style={{textAlign: 'right', width: '35px'}}><strong>User</strong></div>
//                    <div className="example-bar">
//                        <div className="progress">
//                            <div className="progress-bar score-label"
//                                 role="progressbar" aria-valuenow="10"
//                                                    aria-valuemin="0" aria-valuemax="100"
//                                                                      style={{width: '25%'}}>
//                                <span><strong>Score</strong></span>
//                            </div>
//                            <div className="progress-bar"
//                                 role="progressbar" aria-valuenow="50"
//                                                    aria-valuemin="0" aria-valuemax="100"
//                                                                      style={{width: '15%'}}>
//                            </div>
//                            <div className="progress-bar progress-bar-success"
//                                 role="progressbar" aria-valuenow="50"
//                                                    aria-valuemin="0" aria-valuemax="100"
//                                                                      style={{width: '15%'}}>
//                            </div>
//                            <div className="progress-bar score-label"
//                                 role="progressbar" aria-valuenow="10"
//                                                    aria-valuemin="0" aria-valuemax="100"
//                                                                      style={{width: '45%'}}>
//                                <span><strong>Remaining</strong></span>
//                            </div>
//                        </div>
//                    </div>
//                    <div className="example-label">
//                        <strong>
//                            Possible
//                        </strong>
//                    </div>
//                </div>
//            </Panel>
//        );
//    }
//}

export default class ScoresPage extends Component {
    static propTypes = {
        scores: PropTypes.array,
    };

    render() {
        const {scores} = this.props;
        return (
            //<ScoreTableHelpHeader />
            <Grid>
                <ScoresTable scores={scores} />
            </Grid>
        );
    }
}
