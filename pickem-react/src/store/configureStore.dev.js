import {
    compose,
    createStore,
    applyMiddleware,
} from 'redux';
import thunkMiddleware from 'redux-thunk';
import rootReducer from '../reducers';
import pickemAPIMiddleware from '../middleware/pickemapi';
import createLogger from 'redux-logger';
import DevTools from '../Containers/DevTools';
import {
    browserHistory
} from 'react-router';
import {
    syncHistoryWithStore,
    routerMiddleware,
} from 'react-router-redux';

const configureStore = preloadedState => {

    const composer = compose;
    const initializedRouterMiddleware = routerMiddleware(browserHistory);
    const store = createStore(rootReducer,
        composer(applyMiddleware(
                thunkMiddleware, pickemAPIMiddleware, createLogger(),
                initializedRouterMiddleware,
            ),
            DevTools.instrument())
    );
    const history = syncHistoryWithStore(browserHistory, store);
    return {
        store,
        history
    };
}

export default configureStore;
