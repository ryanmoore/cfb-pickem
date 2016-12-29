
import React, { Component } from 'react';
import Matchup, { DragableMatchup } from './Matchup';
import { Row, Col } from 'react-bootstrap';
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
        wageredMatchups: React.PropTypes.arrayOf(React.PropTypes.shape({
            id: React.PropTypes.number.isRequired,
            name: React.PropTypes.string.isRequired,
            left: React.PropTypes.object.isRequired,
            right: React.PropTypes.object.isRequired,
        })).isRequired,
        fixedMatchups: React.PropTypes.array.isRequired,
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
            wageredMatchups,
            fixedMatchups,
            setInitialMatchupOrdering,
            setInitialPicks,
        } = this.props;
        // TODO: Should do this in another component so this one is
        // more focused on data display
        setInitialMatchupOrdering(wageredMatchups.map((matchup) => matchup.id));
        setInitialPicks(extractPicksFromMatchups(
            wageredMatchups.concat(fixedMatchups)));
    }

    render() {
        const { previewIndex, moveMatchup, setPreview,
            makePick, wageredMatchups, fixedMatchups, } = this.props;
        const matchupRows = wageredMatchups.map((matchup, index) => {
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
        const fixedWagerRows = fixedMatchups.map((matchup) => {
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
        const preview = previewIndex !== null && wageredMatchups[previewIndex];
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
