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
import DevTools from './DevTools';

let store = configureStore();

class App extends Component {
    render() {
        return (
            <Provider store={store}>
                <div>
                    <Router history={browserHistory} routes={ routes } />
                    <DevTools />
                </div>
            </Provider>
        );
    }
}

export default App;
