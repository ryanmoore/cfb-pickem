import React, { Component } from 'react';
import {
    Nav,
    Navbar,
    NavItem
} from 'react-bootstrap';
import {
    LinkContainer
} from 'react-router-bootstrap';
import {
    DragDropContext
} from 'react-dnd';
import {
    default as TouchBackend
} from 'react-dnd-touch-backend';
import HTML5Backend from 'react-dnd-html5-backend';


class PickemApp extends Component {
    render() {
        return (
            <div>
                <Navbar bsStyle='default' fixedTop collapseOnSelect >
                    <Navbar.Header>
                        <Navbar.Brand>
                            <a href='#'>Pickem</a>
                        </Navbar.Brand>
                        <Navbar.Toggle />
                    </Navbar.Header>
                    <Navbar.Collapse>
                        <Nav>
                            <LinkContainer to='/'>
                                <NavItem eventKey={1}>Home</NavItem>
                            </LinkContainer>
                            <LinkContainer to='/picks'>
                                <NavItem eventKey={2}>Picks</NavItem>
                            </LinkContainer>
                            <LinkContainer to='/scores'>
                                <NavItem eventKey={3}>Scores</NavItem>
                            </LinkContainer>
                            <LinkContainer to='/makepicks'>
                                <NavItem eventKey={4}>MakePicks</NavItem>
                            </LinkContainer>
                            <LinkContainer to='/login'>
                                <NavItem eventKey={5}>Login</NavItem>
                            </LinkContainer>
                        </Nav>
                    </Navbar.Collapse>
                </Navbar>
                { this.props.children }
           </div>
        );
    }

}

// TODO: Seems we rarely take the html5 backend. Not working in chrome at
// least on dev machine
if ('ontouchstart' in window) {
    // TODO: Update to decorators once stabilized 
    // Use class assign until Decorators stabilize
    // eslint-disable-next-line no-class-assign
    PickemApp = DragDropContext(TouchBackend({
        enableMouseEvents: true
    }))(PickemApp);
} else {
    // eslint-disable-next-line no-class-assign
    PickemApp = DragDropContext(HTML5Backend)(PickemApp);
}

export default PickemApp;

