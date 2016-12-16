import {
    SWAP_MATCHUP_ORDER,
    SET_MATCHUP_PREVIEW
} from './actions'
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
        case SWAP_MATCHUP_ORDER:
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
        case SWAP_MATCHUP_ORDER:
        case SET_MATCHUP_PREVIEW:
            return {...state,
                previewIndex: action.dst
            };
        default:
            return state;
    }
}

const matchupPicker = combineReducers({
    data: swapMatchupOrder,
    ui: setMatchupPreview,
});

export default matchupPicker;
