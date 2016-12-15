
import React, { Component } from 'react';
import './App.css';
import { DragDropContext } from 'react-dnd';
import { default as TouchBackend } from 'react-dnd-touch-backend';
import HTML5Backend from 'react-dnd-html5-backend';
import { MatchupData, PickData } from './Matchup';
import MatchupList from './MatchupList'

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
