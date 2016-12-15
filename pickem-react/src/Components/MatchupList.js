
import React, { Component } from 'react';
import update from 'react/lib/update';
import Matchup, { DragableMatchup } from './Matchup';
import { Grid } from 'react-bootstrap';
import ItemPreview from './ItemPreview';

class MatchupList extends Component {
    static propTypes = {
        matchups: React.PropTypes.arrayOf(React.PropTypes.shape({
            id: React.PropTypes.number.isRequired,
            left: React.PropTypes.object.isRequired,
            right: React.PropTypes.object.isRequired,
        }).isRequired
        )
    };
    constructor(props) {
        super(props);
        this.useCustomPreview = ('ontouchstart' in window);
        this.state = { matchups: props.matchups, previewIndex: null };
        this.moveMatchup = this.moveMatchup.bind(this);
        this.setPreview = this.setPreview.bind(this);
    }

    moveMatchup(dragIndex, hoverIndex) {
        const { matchups } = this.state;
        const draggedMatchup = matchups[dragIndex];
        this.setState(update(this.state, {
            matchups: { $splice: [
                [dragIndex, 1],
                [hoverIndex, 0, draggedMatchup]
            ]},
            previewIndex: { $set: hoverIndex }
        }));
    }

    setPreview(index) {
        this.setState(update(this.state, {previewIndex: {$set: index }}));
    }

    render() {
        const { matchups, previewIndex } = this.state;
        const matchupRows = matchups.map((matchup, index) => {
            return <DragableMatchup
                key={matchup.id}
                id={matchup.id}
                index={index}
                wager={index+1}
                left={matchup.left}
                right={matchup.right}
                moveMatchup={this.moveMatchup}
                setPreview={this.setPreview}
            />
        });
        const preview = previewIndex !== null && matchups[previewIndex];
        return (<Grid>
            {matchupRows}
            <ItemPreview key="__preview">
                { preview && <Matchup id={preview.id}
                    wager={previewIndex+1}
                    left={preview.left}
                    right={preview.right}/> }
            </ItemPreview>
        </Grid>
        );
    }
}

export default MatchupList;
