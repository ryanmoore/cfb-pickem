
import React, { Component } from 'react';
import Matchup, { DragableMatchup } from './Matchup';
import { Grid, Row, Col } from 'react-bootstrap';
import ItemPreview from './ItemPreview';

const extractPicksFromMatchups = (matchups) => {
    var out = {};
    matchups.forEach((matchup) => {
        if(matchup.left.selected) {
            out[matchup.id] = matchup.left.id;
        } else if(matchup.right.selected) {
            out[matchup.id] = matchup.right.id;
        }
    });
    return out;
}

class MatchupList extends Component {

    static propTypes = {
        wagered_matchups: React.PropTypes.arrayOf(React.PropTypes.shape({
            id: React.PropTypes.number.isRequired,
            name: React.PropTypes.string.isRequired,
            left: React.PropTypes.object.isRequired,
            right: React.PropTypes.object.isRequired,
        })).isRequired,
        fixed_matchups: React.PropTypes.array.isRequired,
        previewIndex: React.PropTypes.number,
        moveMatchup: React.PropTypes.func.isRequired,
        setPreview: React.PropTypes.func.isRequired,
        makePick: React.PropTypes.func.isRequired,
        setInitialMatchupOrdering: React.PropTypes.func.isRequired,
        setInitialPicks: React.PropTypes.func.isRequired,
    };

    constructor(props) {
        super(props);
        this.useCustomPreview = ('ontouchstart' in window);
    }

    componentDidMount() {
        const { 
            wagered_matchups,
            fixed_matchups,
            setInitialMatchupOrdering,
            setInitialPicks,
        } = this.props;
        // TODO: Should do this in another component so this one is
        // more focused on data display
        setInitialMatchupOrdering(wagered_matchups.map((matchup) => matchup.id));
        setInitialPicks(extractPicksFromMatchups(
            wagered_matchups.concat(fixed_matchups)));
    }

    render() {
        const { previewIndex, moveMatchup, setPreview,
            makePick, wagered_matchups, fixed_matchups, } = this.props;
        const matchupRows = wagered_matchups.map((matchup, index) => {
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
        const fixedWagerRows = fixed_matchups.map((matchup) => {
            return <Matchup id={matchup.id}
                            key={matchup.id}
                            wager={matchup.fixedWagerAmount}
                            left={matchup.left}
                            right={matchup.right}
                            name={matchup.name}
                            makePick={makePick}
                            preview={false}
                        />
        });
        const preview = previewIndex !== null && wagered_matchups[previewIndex];
        return (
            <div>
                <h2>Championship</h2>
                {fixedWagerRows}
                <h2>Bowl Games</h2>
                {matchupRows.reverse()}
                <Row key='__preview'>
                    <Col xs={12}>
                        <ItemPreview key="__preview">
                            { preview && <Matchup id={preview.id}
                                wager={previewIndex+1}
                                left={preview.left}
                                right={preview.right}
                                name={preview.name}
                                makePick={makePick}
                                preview={true}
                            /> }
                        </ItemPreview>
                    </Col>
                </Row>
            </div>
        );
    }
}

export default MatchupList;
