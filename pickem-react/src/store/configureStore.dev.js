import {
    compose,
    createStore,
    applyMiddleware,
} from 'redux';
import thunk from 'redux-thunk';
import rootReducer from '../reducers';
import pickemAPIMiddleware from '../middleware/pickemapi';
import { createLogger } from 'redux-logger';
import DevTools from '../Containers/DevTools';

const middlewares = [thunk, pickemAPIMiddleware, ];
if(!process.env.testing) {
    middlewares.push(createLogger());
}

const configureStore = preloadedState => {

    const composer = compose;
    const store = createStore(rootReducer,
        composer(applyMiddleware(...middlewares),
            DevTools.instrument())
    );
    return {
        store,
    };
}

export default configureStore;
