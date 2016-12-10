
import React, { Component } from 'react';
//import logo from './logo.svg';
import './App.css';
import {Button, Grid, Row, Col} from 'react-bootstrap';

class MatchupList extends Component {
    render() { return (
        <Grid>
        <Matchup wager={1} left="A" right="B"/>
        <Matchup wager={2} left="C" right="D"/>
        </Grid>
        );
    }
}

class Matchup extends Component {
    render() {
        return (
                <Row>
                <Col xs={4}>{this.props.wager}</Col>
                <Col xs={4}><Pick name={this.props.left}/></Col>
                <Col xs={4}><Pick name={this.props.right}/></Col>
                </Row>
               );
    }
}

class Pick extends Component {
    render() {
        return <Button bsClass="div" bsStyle="default" bsSize="large">{this.props.name}</Button>;
    }
}

class App extends Component {
  render() {
    return <MatchupList/>;
  }
}

export default App;
