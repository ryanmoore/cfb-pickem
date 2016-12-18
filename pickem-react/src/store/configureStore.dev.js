import {
    compose,
    createStore,
    applyMiddleware
} from 'redux';
import thunkMiddleware from 'redux-thunk';
import rootReducer from '../reducers';
import pickemAPIMiddleware from '../middleware/pickemapi';
import createLogger from 'redux-logger';

const configureStore = preloadedState => {

    const composer = window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ || compose;
    const store = createStore(
        rootReducer,
        composer(applyMiddleware(
            thunkMiddleware, pickemAPIMiddleware, createLogger()
        ))
    );
    return store;
}

export default configureStore;
