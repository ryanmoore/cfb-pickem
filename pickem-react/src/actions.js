import pickemSchema from './middleware/pickemSchema';
import {
    CALL_PICKEM_API
} from './middleware/pickemapi';
import {
    selectMatchupOrdering,
    selectGamesForCurrentSeason,
    selectCurrentUIPicks,
    selectCurrentSeason,
} from './Selectors/index';
import forOwn from 'lodash/forOwn';

export const SWAP_MATCHUP_ORDER = 'SWAP_MATCHUP_ORDER';
export const SET_MATCHUP_PREVIEW = 'SET_MATCHUP_PREVIEW';
export const SET_INITIAL_MATCHUP_ORDERING = 'SET_INITIAL_MATCHUP_ORDERING';
export const SET_INITIAL_PICKS = 'SET_INITIAL_PICKS';
export const MAKE_PICK = 'MAKE_PICK';

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

export function setInitialMatchupOrdering(ordering) {
    return {
        type: SET_INITIAL_MATCHUP_ORDERING,
        ordering
    };
}

export function makePick(game, participant) {
    return { 
        type: MAKE_PICK,
        game,
        participant,
    };
}

export function setInitialPicks(picks) {
    return {
        type: SET_INITIAL_PICKS,
        picks
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

}

export const PICKEM_API_AUTH_REQUEST = 'PICKEM_API_AUTH_REQUEST';
export const PICKEM_API_AUTH_SUCCESS = 'PICKEM_API_AUTH_SUCCESS';
export const PICKEM_API_AUTH_FAILURE = 'PICKEM_API_AUTH_FAILURE';

export const SET_PICKEM_API_AUTH_TOKEN = 'SET_PICKEM_API_AUTH_TOKEN';
export const SET_PICKEM_API_AUTH_USER = 'SET_PICKEM_API_AUTH_USER';
export const SET_PICKEM_API_AUTH_USER_AND_TOKEN = 'SET_PICKEM_API_AUTH_USER_AND_TOKEN';

const setPickemAuthToken = (token) => {
    return  {
        type: SET_PICKEM_API_AUTH_TOKEN,
        token: token,
    };
}

const setCurrentAuthUserData = (data) => {
    return {
        type: SET_PICKEM_API_AUTH_USER,
        username: data.username,
    };
}

const handleAuthLoginTokenResponse = (response) => {
    return {
        token: response.token,
        user: response.user,
    };
}

export const fetchPickemAuthToken = (credentials) => {
    const authPayload = btoa(`${credentials.username}:${credentials.password}`);
    return {
        [CALL_PICKEM_API]: {
            types: [PICKEM_API_AUTH_REQUEST, PICKEM_API_AUTH_SUCCESS,
                PICKEM_API_AUTH_FAILURE
            ],
            endpoint: 'auth/login/',
            schema: pickemSchema.AUTH_TOKEN_RESPONSE,
            headers: { 'Authorization': 'Basic ' + authPayload },
            method: 'POST',
            callback: handleAuthLoginTokenResponse,
        }
    };
}


export const pickemAuthLogin = (credentials) => (dispatch) => {
    return dispatch(fetchPickemAuthToken(credentials));
}

export const LOGIN_FORM_USERNAME_UPDATE = 'LOGIN_FORM_USERNAME_UPDATE'
export const LOGIN_FORM_PASSWORD_UPDATE = 'LOGIN_FORM_PASSWORD_UPDATE'
export const loginFormUpdateUsername = (value) => {
    return {
        type: LOGIN_FORM_USERNAME_UPDATE,
        value: value,
    };
}

export const loginFormUpdatePassword = (value) => {
    return {
        type: LOGIN_FORM_PASSWORD_UPDATE,
        value: value,
    };
}

export const LOG_USER_OUT = 'LOG_USER_OUT';
export const logUserOut = () => {
    return {
        type: LOG_USER_OUT,
    }
}

export const PICKEM_API_SUBMIT_POST = 'PICKEM_API_SUBMIT_POST';
export const PICKEM_API_SUBMIT_SUCCESS = 'PICKEM_API_SUBMIT_SUCCESS';
export const PICKEM_API_SUBMIT_FAILURE = 'PICKEM_API_SUBMIT_FAILURE';

const postPicksAndWagers = (data, token) => {
    return {
        [CALL_PICKEM_API]: {
            types: [PICKEM_API_SUBMIT_POST, PICKEM_API_SUBMIT_SUCCESS,
                PICKEM_API_SUBMIT_FAILURE
            ],
            endpoint: 'makepicks/',
            method: 'PUT',
            body: JSON.stringify(data),
            headers: { 'Authorization': 'Token ' + token,
                'Content-Type': 'application/json',
            },
            schema: pickemSchema.SUBMIT_RESPONSE,
        }
    };
}

const formatMakePicksForSubmission = (state)  => {
    const ordering = selectMatchupOrdering(state);
    const games = selectGamesForCurrentSeason(state);
    const picks = selectCurrentUIPicks(state);
    const season = selectCurrentSeason(state);
    var submission = { wagered: [], fixed: [], season };
    forOwn(games, (game, gameid) => {
        const pick = picks[gameid];
        const formatted = {
            game: parseInt(gameid, 10),
            selection: {
                participant: pick,
            }
        };
        if(game.gameDetails.fixedWagerAmount === 0) {
            submission.wagered[ordering.indexOf(parseInt(gameid, 10))] = formatted;
        } else {
            submission.fixed.push(formatted);
        }
    });
    return submission;
}

const selectAuthToken = (state) => state.auth.token;

export const submitPicksAndWagers = () => (dispatch, getState) => {
    const token = selectAuthToken(getState());
    const submission = formatMakePicksForSubmission(getState());
    return dispatch(postPicksAndWagers({ picks: submission}, token)).then(() => {
        dispatch(fetchPickemWagers(selectCurrentSeason(getState())));
        dispatch(fetchPickemSelections(selectCurrentSeason(getState())));
    });
}

export const PICKEM_API_SEASON_REQUEST = 'PICKEM_API_SEASON_REQUEST';
export const PICKEM_API_SEASON_SUCCESS = 'PICKEM_API_SEASON_SUCCESS';
export const PICKEM_API_SEASON_FAILURE = 'PICKEM_API_SEASON_FAILURE';

const fetchPickemSeasons = () => {
    return {
        [CALL_PICKEM_API]: {
            types: [PICKEM_API_SEASON_REQUEST, PICKEM_API_SEASON_SUCCESS,
                PICKEM_API_SEASON_FAILURE
            ],
            endpoint: 'seasons/?limit=1000',
            schema: pickemSchema.SEASON_ARRAY
        }
    };
}

const shouldFetchPickemSeasons  = (state) => {
    const seasons = state.fetchState.seasons;
    if(!seasons || seasons !== FETCH_STATES.READY) {
        return true;
    }
    return false;
}


export const loadPickemSeasons = () => (dispatch, getState) => {
    if(shouldFetchPickemSeasons(getState())) {
        return dispatch(fetchPickemSeasons());
    }
    return null;
}

export const PICKEM_API_POST_WINNER = 'PICKEM_API_POST_WINNER';
export const PICKEM_API_POST_WINNER_SUCCESS = 'PICKEM_API_POST_WINNER_SUCCESS';
export const PICKEM_API_POST_WINNER_FAILURE = 'PICKEM_API_POST_WINNER_FAILURE';

const pickemAPIPostWinner = (data, token) => {
    return {
        [CALL_PICKEM_API]: {
            types: [PICKEM_API_POST_WINNER, PICKEM_API_POST_WINNER_SUCCESS,
                PICKEM_API_POST_WINNER_FAILURE
            ],
            endpoint: 'winners/',
            method: 'POST',
            body: JSON.stringify(data),
            // Handling case if token is 'undefined' as it causes an error
            // server side due to a bug expecting well formed tokens
            headers: { 'Authorization': 'Token ' + (token || ''),
                'Content-Type': 'application/json',
            },
            schema: pickemSchema.WINNER,
        }
    };
}

export const PICKEM_WINNER_BUTTON_PRESS = 'PICKEM_WINNER_BUTTON_PRESS';
export const submitAddWinnerButtonPress = (id) => (dispatch, getState) => {
    const payload = { participant: id };
    return dispatch(pickemAPIPostWinner(payload, selectAuthToken(getState())));
}

export const SET_SELECTED_SEASON = 'SET_SELECTED_SEASON';
export const setSelectedSeason = (year) => {
    return {
        type: SET_SELECTED_SEASON,
        year,
    };
}
