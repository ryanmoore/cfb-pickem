
import React, { Component } from 'react';
import Matchup, { DragableMatchup } from './Matchup';
import { Grid, Row, Col } from 'react-bootstrap';
import ItemPreview from './ItemPreview';
import { setInitialMatchupOrdering } from '../actions';

class MatchupList extends Component {

    static propTypes = {
        matchups: React.PropTypes.arrayOf(React.PropTypes.shape({
            id: React.PropTypes.number.isRequired,
            name: React.PropTypes.string.isRequired,
            left: React.PropTypes.object.isRequired,
            right: React.PropTypes.object.isRequired,
        }).isRequired
        ),
        previewIndex: React.PropTypes.number,
        moveMatchup: React.PropTypes.func.isRequired,
        setPreview: React.PropTypes.func.isRequired,
        makePick: React.PropTypes.func.isRequired,
        dispatch: React.PropTypes.func.isRequired,
    };

    constructor(props) {
        super(props);
        this.useCustomPreview = ('ontouchstart' in window);
    }

    componentDidMount() {
        const { 
            dispatch,
            matchups } = this.props;
        // TODO: Should do this in another component so this one is
        // more focused on data display
        dispatch(setInitialMatchupOrdering(matchups.map((matchup) => matchup.id)));
    }

    render() {
        const { matchups, previewIndex, moveMatchup, setPreview, makePick } = this.props;
        const matchupRows = matchups.map((matchup, index) => {
            return <DragableMatchup
                key={matchup.id}
                id={matchup.id}
                index={index}
                wager={index+1}
                left={matchup.left}
                right={matchup.right}
                name={matchup.name}
                moveMatchup={moveMatchup}
                setPreview={setPreview}
                makePick={makePick}
            />
        });
        const preview = previewIndex !== null && matchups[previewIndex];
        return (<Grid>
            {matchupRows}
            <Row key='__preview'>
                <Col xs={12}>
                    <ItemPreview key="__preview">
                        { preview && <Matchup id={preview.id}
                            wager={previewIndex+1}
                            left={preview.left}
                            right={preview.right}
                            name={preview.name}
                            makePick={makePick}
                        /> }
                    </ItemPreview>
                </Col>
            </Row>
        </Grid>
        );
    }
}

export default MatchupList;
