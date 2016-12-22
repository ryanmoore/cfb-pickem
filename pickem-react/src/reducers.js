import * as ActionTypes from './actions';
import {
    combineReducers
} from 'redux';
import forOwn from 'lodash/forOwn';

const initialState = {
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
        '1': {
            id: 1,
            name: 'A',
            rank: 1
        },
        '2': {
            id: 2,
            name: 'B',
            rank: 2
        },
        '3': {
            id: 3,
            name: 'C'
        },
        '4': {
            id: 4,
            name: 'D'
        },
        '5': {
            id: 5,
            name: 'E'
        },
        '6': {
            id: 6,
            name: 'F'
        }
    },
    matchupOrders: {
        '1': {
            id: 1,
            ordering: [1, 2, 3]
        }
    },
    users: {
        '1': {
            id: 1,
            name: 'Ryan'
        }
    }
};

function copyAndMoveEltFromTo(array, src, dst) {
    let arrCopy = [...array.slice(0, src), ...array.slice(src + 1)];
    arrCopy.splice(dst, 0, array[src]);
    return arrCopy;
}

const selectAndSortUserWagers = (wagers, user) => {
    var ordering = [];
    var weights = {};
    forOwn(wagers, (wager) => {
        if (wager.user === user) {
            ordering.push(wager.game)
            weights[wager.game] = wager.amount;
        }
    });
    ordering.sort((gameA, gameB) => {
        const a = weights[gameA];
        const b = weights[gameB];
        if (a < b) return 1;
        if (a > b) return -1;
        return 0;
    });
    return ordering;
}

const matchupInitialState = {
    matchupOrders: {},
    currentUser: 1,
};

function setMatchupOrder(state = matchupInitialState, action) {
    switch (action.type) {
        case ActionTypes.SWAP_MATCHUP_ORDER:
            return swapMatchupOrder(state, action);
        case ActionTypes.PICKEM_API_WAGER_SUCCESS:
            return {...state,
                matchupOrders: {
                    ...state.matchupOrders,
                    //TODO: CurrentUser
                    '1': selectAndSortUserWagers(
                        action.response.entities.wagers, state.currentUser)
                }
            };
        default:
            return state;
    }
}

function swapMatchupOrder(state, action) {
    const id = action.id || 1;
    switch (action.type) {
        case ActionTypes.SWAP_MATCHUP_ORDER:
            return {...state,
                matchupOrders: {
                    ...state.matchupOrders,
                    '1': copyAndMoveEltFromTo(
                        state.matchupOrders[id], action.src, action.dst)
                }
            };
            //return update(state, {
            //    ordering: { $splice: [
            //        [action.src, 1],
            //        [action.dst, 0, state.matchupOrders[id][action.src]]
            //    ]},
            //});
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
        return {...state,
            ...action.response.entities
        };
    }
    return state;
}

const setCurrentSeason = (state = 3, action) => {
    return state;
}

const authStateReducer = (state={}, action) => {
    switch(action.type) {
        case ActionTypes.PICKEM_API_AUTH_SUCCESS:
            return { ...action.response };
        case ActionTypes.SET_PICKEM_API_AUTH_TOKEN:
            return { ...state, token: action.token };
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
        default:
            return state;
    }
}

const rootReducer = combineReducers({
    ui: combineReducers({
        makePicksOrdering: setMatchupOrder,
        matchupPreview: setMatchupPreview,
        currentSeason: setCurrentSeason,
        currentUser: () => 1,
        loginForm: loginFormReducer,
    }),
    auth: authStateReducer,
    entities,
    fetchState,
}, );

export default rootReducer;
