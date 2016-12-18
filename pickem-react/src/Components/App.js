import React, {
    Component
} from 'react';
import './App.css';
import {
    Provider
} from 'react-redux';

import {
    Router,
    browserHistory
} from 'react-router';
import routes from '../routes';
import configureStore from '../store/configureStore';

let store = configureStore();

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
