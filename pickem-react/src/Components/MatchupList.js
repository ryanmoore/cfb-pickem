
import React, { Component } from 'react';
import Matchup, { DragableMatchup } from './Matchup';
import { Grid, Row, Col } from 'react-bootstrap';
import ItemPreview from './ItemPreview';

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
    };

    constructor(props) {
        super(props);
        this.useCustomPreview = ('ontouchstart' in window);
    }

    render() {
        const { matchups, previewIndex, moveMatchup, setPreview } = this.props;
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
            />
        });
        const preview = previewIndex !== null && matchups[previewIndex];
        return (<Grid>
            {matchupRows}
            <Row>
                <Col xs={12}>
                    <ItemPreview key="__preview">
                        { preview && <Matchup id={preview.id}
                            wager={previewIndex+1}
                            left={preview.left}
                            right={preview.right}
                            name={preview.name}/> }
                    </ItemPreview>
                </Col>
            </Row>
        </Grid>
        );
    }
}

export default MatchupList;
