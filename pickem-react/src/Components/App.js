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
    createStore
} from 'redux';
import matchupPicker from '../reducers';
import DisplayedMatchupList from '../Containers/DisplayedMatchupList';
import { Provider } from 'react-redux';

const initialState = {
    data: {
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
            '1': { id: 1, name: 'A', rank: 1 },
            '2': { id: 2, name: 'B', rank: 2 },
            '3': { id: 3, name: 'C' },
            '4': { id: 4, name: 'D' },
            '5': { id: 5, name: 'E' },
            '6': { id: 6, name: 'Foobar' }
        },
        matchupOrders: {
            '1': { id: 1, ordering: [1, 2, 3] }
        },
        users: {
            '1': { id: 1, name: 'Ryan' }
        }
    },
    ui: {
        currentUser: 1,
        previewIndex: 1
    }
};

let store = createStore(matchupPicker, initialState
    //,window.__REDUX_DEVTOOLS_EXTENSION__ && window.__REDUX_DEVTOOLS_EXTENSION__()
);


class App extends Component {
    render() {
        return (
            <Provider store={store}>
                <DisplayedMatchupList />
            </Provider>
        );
    }
}

// TODO: Seems we rarely take the html5 backend. Not working in chrome at
// least on dev machine
if ('ontouchstart' in window) {
    App = DragDropContext(TouchBackend({ enableMouseEvents: true }))(App);
} else {
    App = DragDropContext(HTML5Backend)(App);
}

export default App;
