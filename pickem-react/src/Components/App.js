import React, {
    Component
} from 'react';
import './App.css';
import {
    compose,
    createStore,
    applyMiddleware
} from 'redux';
import thunkMiddleware from 'redux-thunk';
import matchupPicker from '../reducers';
import {
    Provider
} from 'react-redux';

import {
    Router,
    browserHistory
} from 'react-router';
import pickemAPIMiddleware from '../middleware/pickemapi';
import createLogger from 'redux-logger';
import routes from '../routes';

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

class App extends Component {
    render() {
        return (
            <Provider store={store}>
                <Router history={browserHistory} routes={ routes } />
            </Provider>
        );
    }
}

export default App;
