import * as ActionTypes from './actions';
import {
    combineReducers
} from 'redux';

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

function swapMatchupOrder(state = initialState, action) {
    const id = action.id || 1;
    switch (action.type) {
        case ActionTypes.SWAP_MATCHUP_ORDER:
            return {...state,
                matchupOrders: {
                    ...state.matchupOrders,
                    '1': {
                        ...state.matchupOrders[id],
                        ordering: copyAndMoveEltFromTo(
                            state.matchupOrders[id].ordering, action.src, action.dst)
                    }
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
    switch(action.type) {
        case ActionTypes.PICKEM_API_GAME_REQUEST:
            return { ...state, games: ActionTypes.FETCH_STATES.IN_PROGRESS };
        case ActionTypes.PICKEM_API_GAME_FAILURE:
            return { ...state, games: ActionTypes.FETCH_STATES.FAILED };
        case ActionTypes.PICKEM_API_GAME_SUCCESS:
            return { ...state, games: ActionTypes.FETCH_STATES.READY };
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
    if(action.response && action.response.entities) {
        return { ...state, ...action.response.entities };
    }
    return state;
}

const matchupPicker = combineReducers({
        data: swapMatchupOrder,
        ui: setMatchupPreview,
        entities,
        fetchState,
    },
);

export default matchupPicker;
