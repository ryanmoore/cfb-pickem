
import React, { Component } from 'react';
import update from 'react/lib/update';
import './App.css';
import { DragDropContext } from 'react-dnd';
import { default as TouchBackend } from 'react-dnd-touch-backend';
import HTML5Backend from 'react-dnd-html5-backend';
import Matchup, { MatchupData, PickData, DragableMatchup } from './Matchup.jsx';
import { Grid } from 'react-bootstrap';
import ItemPreview from './ItemPreview.jsx';

class MatchupList extends Component {
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

class App extends Component {
    render() {
        const matchups = [
            new MatchupData(1, new PickData(1, "A", 1), new PickData(2, "B", 2)),
            new MatchupData(2, new PickData(3, "C"), new PickData(4, "D")),
            new MatchupData(3, new PickData(5, "E"), new PickData(6, "F")),
        ];
        return <MatchupList matchups={matchups}/>;
    }
}
if( 'ontouchstart' in window) {
    App = DragDropContext(TouchBackend)(App);
} else {
    App = DragDropContext(HTML5Backend)(App);
}

export default App;
