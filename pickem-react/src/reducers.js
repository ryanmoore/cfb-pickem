import * as ActionTypes from './actions';
import {
    combineReducers
} from 'redux';
import {
    routerReducer,
} from 'react-router-redux';
import merge from 'lodash/merge';

function copyAndMoveEltFromTo(array, src, dst) {
    let arrCopy = [...array.slice(0, src), ...array.slice(src + 1)];
    arrCopy.splice(dst, 0, array[src]);
    return arrCopy;
}

const matchupInitialState = {
    matchupOrdering: [],
    picks: {},
};

function setMatchupOrder(state = matchupInitialState, action) {
    switch (action.type) {
        case ActionTypes.SWAP_MATCHUP_ORDER:
            return swapMatchupOrder(state, action);
        case ActionTypes.SET_INITIAL_MATCHUP_ORDERING:
            return { ...state, matchupOrdering: action.ordering };
        case ActionTypes.MAKE_PICK:
            return { 
                ...state,
                picks: {
                    ...state.picks,
                    [action.game]: action.participant 
                }
            };
        case ActionTypes.SET_INITIAL_PICKS:
            return {
                ...state,
                picks: action.picks,
            };
        default:
            return state;
    }
}

function swapMatchupOrder(state, action) {
    switch (action.type) {
        case ActionTypes.SWAP_MATCHUP_ORDER:
            return {...state,
                    matchupOrdering: copyAndMoveEltFromTo(
                        state.matchupOrdering, action.src, action.dst)
            };
        default:
            return state;
    }
}

function setMatchupPreview(state = {
    currentUser: 1,
    previewIndex: 1
}, action) {
    switch (action.type) {
        case ActionTypes.SWAP_MATCHUP_ORDER:
        case ActionTypes.SET_MATCHUP_PREVIEW:
            return {...state,
                previewIndex: action.dst
            };
        default:
            return state;
    }
}


const defaultFetchState = {};

const fetchState = (state = defaultFetchState, action) => {
    switch (action.type) {
        case ActionTypes.PICKEM_API_GAME_REQUEST:
            return {...state,
                games: ActionTypes.FETCH_STATES.IN_PROGRESS
            };
        case ActionTypes.PICKEM_API_GAME_FAILURE:
            return {...state,
                games: ActionTypes.FETCH_STATES.FAILED
            };
        case ActionTypes.PICKEM_API_GAME_SUCCESS:
            return {...state,
                games: ActionTypes.FETCH_STATES.READY
            };
        case ActionTypes.PICKEM_API_USER_REQUEST:
            return {...state,
                users: ActionTypes.FETCH_STATES.IN_PROGRESS
            };
        case ActionTypes.PICKEM_API_USER_FAILURE:
            return {...state,
                users: ActionTypes.FETCH_STATES.FAILED
            };
        case ActionTypes.PICKEM_API_USER_SUCCESS:
            return {...state,
                users: ActionTypes.FETCH_STATES.READY
            };
        case ActionTypes.PICKEM_API_TEAMSEASON_REQUEST:
            return {...state,
                teamseasons: ActionTypes.FETCH_STATES.IN_PROGRESS
            };
        case ActionTypes.PICKEM_API_TEAMSEASON_FAILURE:
            return {...state,
                teamseasons: ActionTypes.FETCH_STATES.FAILED
            };
        case ActionTypes.PICKEM_API_TEAMSEASON_SUCCESS:
            return {...state,
                teamseasons: ActionTypes.FETCH_STATES.READY
            };
        case ActionTypes.PICKEM_API_PARTICIPANT_REQUEST:
            return {...state,
                participants: ActionTypes.FETCH_STATES.IN_PROGRESS
            };
        case ActionTypes.PICKEM_API_PARTICIPANT_FAILURE:
            return {...state,
                participants: ActionTypes.FETCH_STATES.FAILED
            };
        case ActionTypes.PICKEM_API_PARTICIPANT_SUCCESS:
            return {...state,
                participants: ActionTypes.FETCH_STATES.READY
            };
        case ActionTypes.PICKEM_API_WAGER_REQUEST:
            return {...state,
                wagers: ActionTypes.FETCH_STATES.IN_PROGRESS
            };
        case ActionTypes.PICKEM_API_WAGER_FAILURE:
            return {...state,
                wagers: ActionTypes.FETCH_STATES.FAILED
            };
        case ActionTypes.PICKEM_API_WAGER_SUCCESS:
            return {...state,
                wagers: ActionTypes.FETCH_STATES.READY
            };
        case ActionTypes.PICKEM_API_SELECTION_REQUEST:
            return {...state,
                selections: ActionTypes.FETCH_STATES.IN_PROGRESS
            };
        case ActionTypes.PICKEM_API_SELECTION_FAILURE:
            return {...state,
                selections: ActionTypes.FETCH_STATES.FAILED
            };
        case ActionTypes.PICKEM_API_SELECTION_SUCCESS:
            return {...state,
                selections: ActionTypes.FETCH_STATES.READY
            };
        case ActionTypes.PICKEM_API_WINNER_REQUEST:
            return {...state,
                winners: ActionTypes.FETCH_STATES.IN_PROGRESS
            };
        case ActionTypes.PICKEM_API_WINNER_FAILURE:
            return {...state,
                winners: ActionTypes.FETCH_STATES.FAILED
            };
        case ActionTypes.PICKEM_API_WINNER_SUCCESS:
            return {...state,
                winners: ActionTypes.FETCH_STATES.READY
            };
        case ActionTypes.PICKEM_API_SEASON_REQUEST:
            return {...state,
                seasons: ActionTypes.FETCH_STATES.IN_PROGRESS
            };
        case ActionTypes.PICKEM_API_SEASON_FAILURE:
            return {...state,
                seasons: ActionTypes.FETCH_STATES.FAILED
            };
        case ActionTypes.PICKEM_API_SEASON_SUCCESS:
            return {...state,
                seasons: ActionTypes.FETCH_STATES.READY
            };
        case ActionTypes.SET_SELECTED_SEASON:
            return {...state,
                games: ActionTypes.FETCH_STATES.INVALIDATED,
                participants: ActionTypes.FETCH_STATES.INVALIDATED,
                winners: ActionTypes.FETCH_STATES.INVALIDATED,
                teamseasons: ActionTypes.FETCH_STATES.INVALIDATED,
                selections: ActionTypes.FETCH_STATES.INVALIDATED,
                wagers: ActionTypes.FETCH_STATES.INVALIDATED,
            };
        default:
            return state;
    }
}


const defaultEntityState = {
    games: {}
};

// Update entity cache for any response which has the field
// response.entities
const entities = (state = defaultEntityState, action) => {
    if (action.response && action.response.entities) {
        return merge({}, state, action.response.entities);
    }
    return state;
}

const setCurrentSeason = (state = 4, action) => {
    return state;
}

const setCurrentYear = (state = 2016, action) => {
    switch(action.type) {
        case ActionTypes.SET_SELECTED_SEASON:
            return action.year;
        default:
            return state;
    }
}

const authStateReducer = (state={}, action) => {
    switch(action.type) {
        case ActionTypes.PICKEM_API_AUTH_SUCCESS:
            return { ...action.response };
        case ActionTypes.SET_PICKEM_API_AUTH_TOKEN:
            return { ...state, token: action.token };
        case ActionTypes.LOG_USER_OUT:
            return {};
        default:
            return state;
    }
}

const loginFormReducer = (state={}, action) => {
    switch(action.type) {
        case ActionTypes.LOGIN_FORM_PASSWORD_UPDATE:
            return {...state, password: action.value };
        case ActionTypes.LOGIN_FORM_USERNAME_UPDATE:
            return {...state, username: action.value };
        case ActionTypes.PICKEM_API_AUTH_SUCCESS:
            return {};
        default:
            return state;
    }
}

const rootReducer = combineReducers({
    ui: combineReducers({
        makePicksOrdering: setMatchupOrder,
        matchupPreview: setMatchupPreview,
        currentSeason: setCurrentSeason,
        currentYear: setCurrentYear,
        currentUser: () => 1,
        loginForm: loginFormReducer,
    }),
    auth: authStateReducer,
    entities,
    fetchState,
    routing: routerReducer,
},);

export default rootReducer;
