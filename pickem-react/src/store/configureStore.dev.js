import {
    compose,
    createStore,
    applyMiddleware
} from 'redux';
import thunkMiddleware from 'redux-thunk';
import rootReducer from '../reducers';
import pickemAPIMiddleware from '../middleware/pickemapi';
import createLogger from 'redux-logger';
import DevTools from '../Containers/DevTools';

const configureStore = preloadedState => {

    const composer = compose;
    const store = createStore(
        rootReducer,
        composer(applyMiddleware(
                thunkMiddleware, pickemAPIMiddleware, createLogger()
            ),
            DevTools.instrument())
    );
    return store;
}

export default configureStore;
