import {
    compose,
    createStore,
    applyMiddleware
} from 'redux';
import thunkMiddleware from 'redux-thunk';
import rootReducer from '../reducers';
import pickemAPIMiddleware from '../middleware/pickemapi';

const configureStore = preloadedState => {

    const composer = compose;
    const store = createStore(
        rootReducer,
        composer(applyMiddleware(
            thunkMiddleware, pickemAPIMiddleware
        ))
    );
    return store;
}

export default configureStore;
