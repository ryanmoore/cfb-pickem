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

export const PICKEM_API_USER_REQUEST = 'PICKEM_API_USER_REQUEST';
export const PICKEM_API_USER_SUCCESS = 'PICKEM_API_USER_SUCCESS';
export const PICKEM_API_USER_FAILURE = 'PICKEM_API_USER_FAILURE';

const fetchPickemUsers = () => {
    return {
        [CALL_PICKEM_API]: {
            types: [PICKEM_API_USER_REQUEST, PICKEM_API_USER_SUCCESS,
                PICKEM_API_USER_FAILURE
            ],
            endpoint: 'users/?limit=100',
            schema: pickemSchema.USER_ARRAY
        }
    };
}

const shouldFetchPickemUsers = (state) => {
    const users = state.fetchState.users;
    if(!users || users !== FETCH_STATES.READY) {
        return true;
    }
    return false;
}


export const loadPickemUsers = () => (dispatch, getState) => {
    if(shouldFetchPickemUsers(getState())) {
        return dispatch(fetchPickemUsers());
    }
    return null;
}

export const PICKEM_API_PARTICIPANT_REQUEST = 'PICKEM_API_PARTICIPANT_REQUEST';
export const PICKEM_API_PARTICIPANT_SUCCESS = 'PICKEM_API_PARTICIPANT_SUCCESS';
export const PICKEM_API_PARTICIPANT_FAILURE = 'PICKEM_API_PARTICIPANT_FAILURE';

const fetchPickemParticipants = (season) => {
    return {
        [CALL_PICKEM_API]: {
            types: [PICKEM_API_PARTICIPANT_REQUEST, PICKEM_API_PARTICIPANT_SUCCESS,
                PICKEM_API_PARTICIPANT_FAILURE
            ],
            endpoint: `participants/?limit=1000&season=${season}`,
            schema: pickemSchema.PARTICIPANT_ARRAY
        }
    };
}

const shouldFetchPickemParticipants  = (state, season) => {
    const participants = state.fetchState.participants;
    if(!participants || participants !== FETCH_STATES.READY) {
        return true;
    }
    return false;
}


export const loadPickemParticipants = (season) => (dispatch, getState) => {
    if(shouldFetchPickemParticipants(getState(season))) {
        return dispatch(fetchPickemParticipants(season));
    }
    return null;
}

export const PICKEM_API_TEAMSEASON_REQUEST = 'PICKEM_API_TEAMSEASON_REQUEST';
export const PICKEM_API_TEAMSEASON_SUCCESS = 'PICKEM_API_TEAMSEASON_SUCCESS';
export const PICKEM_API_TEAMSEASON_FAILURE = 'PICKEM_API_TEAMSEASON_FAILURE';

const fetchPickemTeamSeasons = (season) => {
    return {
        [CALL_PICKEM_API]: {
            types: [PICKEM_API_TEAMSEASON_REQUEST, PICKEM_API_TEAMSEASON_SUCCESS,
                PICKEM_API_TEAMSEASON_FAILURE
            ],
            endpoint: `teamseasons/?limit=1000&season=${season}`,
            schema: pickemSchema.TEAMSEASON_ARRAY
        }
    };
}

const shouldFetchPickemTeamSeasons  = (state, season) => {
    const teamseasons = state.fetchState.teamseasons;
    if(!teamseasons || teamseasons !== FETCH_STATES.READY) {
        return true;
    }
    return false;
}


export const loadPickemTeamSeasons = (season) => (dispatch, getState) => {
    if(shouldFetchPickemTeamSeasons(getState(season))) {
        return dispatch(fetchPickemTeamSeasons(season));
    }
    return null;
}

export const PICKEM_API_SELECTION_REQUEST = 'PICKEM_API_SELECTION_REQUEST';
export const PICKEM_API_SELECTION_SUCCESS = 'PICKEM_API_SELECTION_SUCCESS';
export const PICKEM_API_SELECTION_FAILURE = 'PICKEM_API_SELECTION_FAILURE';

const fetchPickemSelections = (season) => {
    return {
        [CALL_PICKEM_API]: {
            types: [PICKEM_API_SELECTION_REQUEST, PICKEM_API_SELECTION_SUCCESS,
                PICKEM_API_SELECTION_FAILURE
            ],
            endpoint: `selections/?limit=1000&season=${season}`,
            schema: pickemSchema.SELECTION_ARRAY
        }
    };
}

const shouldFetchPickemSelections  = (state, season) => {
    const selections = state.fetchState.selections;
    if(!selections || selections !== FETCH_STATES.READY) {
        return true;
    }
    return false;
}


export const loadPickemSelections = (season) => (dispatch, getState) => {
    if(shouldFetchPickemSelections(getState(season))) {
        return dispatch(fetchPickemSelections(season));
    }
    return null;
}

export const PICKEM_API_WAGER_REQUEST = 'PICKEM_API_WAGER_REQUEST';
export const PICKEM_API_WAGER_SUCCESS = 'PICKEM_API_WAGER_SUCCESS';
export const PICKEM_API_WAGER_FAILURE = 'PICKEM_API_WAGER_FAILURE';

const fetchPickemWagers = (season) => {
    return {
        [CALL_PICKEM_API]: {
            types: [PICKEM_API_WAGER_REQUEST, PICKEM_API_WAGER_SUCCESS,
                PICKEM_API_WAGER_FAILURE
            ],
            endpoint: `wagers/?limit=1000&season=${season}`,
            schema: pickemSchema.WAGER_ARRAY
        }
    };
}

const shouldFetchPickemWagers  = (state, season) => {
    const wagers = state.fetchState.wagers;
    if(!wagers || wagers !== FETCH_STATES.READY) {
        return true;
    }
    return false;
}


export const loadPickemWagers = (season) => (dispatch, getState) => {
    if(shouldFetchPickemWagers(getState(season))) {
        return dispatch(fetchPickemWagers(season));
    }
    return null;
}

export const PICKEM_API_WINNER_REQUEST = 'PICKEM_API_WINNER_REQUEST';
export const PICKEM_API_WINNER_SUCCESS = 'PICKEM_API_WINNER_SUCCESS';
export const PICKEM_API_WINNER_FAILURE = 'PICKEM_API_WINNER_FAILURE';

const fetchPickemWinners = (season) => {
    return {
        [CALL_PICKEM_API]: {
            types: [PICKEM_API_WINNER_REQUEST, PICKEM_API_WINNER_SUCCESS,
                PICKEM_API_WINNER_FAILURE
            ],
            endpoint: `winners/?limit=1000&season=${season}`,
            schema: pickemSchema.WINNER_ARRAY
        }
    };
}

const shouldFetchPickemWinners  = (state, season) => {
    const winners = state.fetchState.winners;
    if(!winners || winners !== FETCH_STATES.READY) {
        return true;
    }
    return false;
}


export const loadPickemWinners = (season) => (dispatch, getState) => {
    if(shouldFetchPickemWinners(getState(season))) {
        return dispatch(fetchPickemWinners(season));
    }
    return null;
}
