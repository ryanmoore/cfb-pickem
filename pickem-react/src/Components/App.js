import React, {
    Component
} from 'react';
import './App.css';
import {
    DragDropContext
} from 'react-dnd';
import {
    default as TouchBackend
} from 'react-dnd-touch-backend';
import HTML5Backend from 'react-dnd-html5-backend';
import {
    compose,
    createStore,
    applyMiddleware
} from 'redux';
import thunkMiddleware from 'redux-thunk';
import matchupPicker from '../reducers';
import DisplayedMatchupList from '../Containers/DisplayedMatchupList';
import GameIndex from '../Containers/GameIndex';
import {
    Provider
} from 'react-redux';

import {
    Nav,
    Navbar,
    NavItem
} from 'react-bootstrap';
import {
    Router,
    Route,
    IndexRoute,
    browserHistory
} from 'react-router';
import {
    LinkContainer
} from 'react-router-bootstrap';
import pickemAPIMiddleware from '../middleware/pickemapi';
import createLogger from 'redux-logger';

const initialState = {
    data: {
        games: [
            {
                datetime: '2013-12-30T16:45:00Z',
                event: 'http://127.0.0.1:8000/api/events/Bell%20Helicopter%20Armed%20Forces%20Bowl/',
                fixed_wager_amount: 0,
                season: 'http://127.0.0.1:8000/api/seasons/1/',
                url: 'http://127.0.0.1:8000/api/games/10/'
            },
        ],
        matchups: {
            '1': {
                id: 1,
                left: 1,
                right: 2
            },
            '2': {
                id: 2,
                left: 3,
                right: 4
            },
            '3': {
                id: 3,
                left: 5,
                right: 6
            }
        },
        teams: {
            '1': {
                id: 1,
                name: 'A',
                rank: 1
            },
            '2': {
                id: 2,
                name: 'B',
                rank: 2
            },
            '3': {
                id: 3,
                name: 'C'
            },
            '4': {
                id: 4,
                name: 'D'
            },
            '5': {
                id: 5,
                name: 'E'
            },
            '6': {
                id: 6,
                name: 'Foobar'
            }
        },
        matchupOrders: {
            '1': {
                id: 1,
                ordering: [1, 2, 3]
            }
        },
        users: {
            '1': {
                id: 1,
                name: 'Ryan'
            }
        }
    },
    ui: {
        currentUser: 1,
        previewIndex: 1
    }
};

const composeEnhancer = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;
let store = createStore(matchupPicker,
    composeEnhancer(applyMiddleware(
        thunkMiddleware, pickemAPIMiddleware, createLogger()
    ))
    //,window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__()
);

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
                            <NavItem eventKey={2} href='#'>Picks</NavItem>
                            <NavItem eventKey={3} href='#'>Scores</NavItem>
                            <LinkContainer to='/picks'>
                                <NavItem eventKey={4}>MakePicks</NavItem>
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

class App extends Component {
    render() {
        return (
            <Provider store={store}>
                <Router history={browserHistory}>
                    <Route path='/' component={PickemApp}>
                        <IndexRoute component={GameIndex} />
                        <Route path='picks' component={DisplayedMatchupList} />
                    </Route>
                </Router>
            </Provider>
        );
    }
}

export default App;
