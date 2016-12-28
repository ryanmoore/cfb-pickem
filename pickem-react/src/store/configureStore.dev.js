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
    syncHistoryWithStore,
    routerMiddleware,
} from 'react-router-redux';
import { createHistory } from 'history';
import { useRouterHistory } from 'react-router';

const configureStore = preloadedState => {

    const composer = compose;
    const browserHistory = useRouterHistory(createHistory)({
        basename: process.env.REACT_APP_SITE_BASENAME,
    });
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
