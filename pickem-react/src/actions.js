import pickemSchema from './middleware/pickemSchema';
import {
    CALL_PICKEM_API
} from './middleware/pickemapi';

export const SWAP_MATCHUP_ORDER = 'SWAP_MATCHUP_ORDER';
export const SET_MATCHUP_PREVIEW = 'SET_MATCHUP_PREVIEW';

export function swapMatchupOrder(id, src, dst) {
    return {
        type: SWAP_MATCHUP_ORDER,
        id,
        src,
        dst
    };
}

export function setMatchupPreview(dst) {
    return {
        type: SET_MATCHUP_PREVIEW,
        dst
    };
}

export const FETCH_STATES = {
    READY: 'READY',
    IN_PROGRESS: 'IN_PROGRESS',
    FAILED: 'FAILED',
};

export const PICKEM_API_GAME_REQUEST = 'PICKEM_API_GAME_REQUEST';
export const PICKEM_API_GAME_SUCCESS = 'PICKEM_API_GAME_SUCCESS';
export const PICKEM_API_GAME_FAILURE = 'PICKEM_API_GAME_FAILURE';

const fetchPickemGames = (season) => {
    return {
        [CALL_PICKEM_API]: {
            types: [PICKEM_API_GAME_REQUEST, PICKEM_API_GAME_SUCCESS,
                PICKEM_API_GAME_FAILURE
            ],
            endpoint: `games/?limit=100&season=${season}`,
            schema: pickemSchema.GAME_ARRAY
        }
    };
}

const shouldFetchPickemGames = (state, season) => {
    const games = state.fetchState.games;
    if(!games || games !== FETCH_STATES.READY) {
        return true;
    }
    return false;
}


export const loadPickemGames = (season) => (dispatch, getState) => {
    if(shouldFetchPickemGames(getState(), season)) {
        return dispatch(fetchPickemGames(season));
    }
    return null;
}

