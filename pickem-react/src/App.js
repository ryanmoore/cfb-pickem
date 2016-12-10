
import React, { Component } from 'react';
//import logo from './logo.svg';
import './App.css';
import {Button, Grid, Row, Col, Glyphicon} from 'react-bootstrap';

class PickData {
    constructor(id, name, rank) {
        this.id = id;
        this.name = name;
        this.rank = rank;
    }
    toString() {
        var str = this.name;
        if(this.rank) {
            str = "(" + this.rank.toString() + ") " + str;
        }
        return str;
    }
}

class MatchupData {
    constructor(id, left, right) {
        this.id = id;
        this.left = left;
        this.right = right;
    }
}

class Pick extends Component {
    render() {
        return (
                <Col xs={4} className="matchup-col btn btn-default">
                <label className="pick-button" htmlFor={this.props.pickdata.id}>
                {this.props.pickdata.toString()}
                </label>
                </Col>
               );
    }
}

class MatchupHandle extends Component {
    render() {
        return (
                <Col xs={4} className="handle matchup-col">
                    <span className="handle-grip">::</span>
                    <span className="matchup-wager">{this.props.wager}</span>
                    <span className="matchup-info">
                        <Button className="matchup-info-btn" bsStyle="default"> 
                            <Glyphicon glyph="info-sign"/>
                        </Button>
                        <span className="hidden-xs">
                            Name // TODO
                        </span>
                    </span>
                </Col>
               );
    }
}

class Matchup extends Component {
    render() {
        return (
                <Row>
                <MatchupHandle wager={this.props.wager}/>
                <Pick pickdata={this.props.left}/>
                <Pick pickdata={this.props.right}/>
                </Row>
               );
    }
}

class MatchupList extends Component {
    render() {
        const matchups = this.props.matchups.map((matchup, index) => {
            return <Matchup key={matchup.id} wager={index+1} left={matchup.left} right={matchup.right}/>
        }
        );
        return (<Grid>{matchups}</Grid>);
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
export default App;
export { PickData };
