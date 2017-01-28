import {
    selectGames,
    selectTeamSeasons,
    selectParticipants,
    selectWagers,
    selectSelections,
    selectSeasons,
    selectCurrentUser,
    selectUsers,
    selectMatchupOrdering,
    selectCurrentUIPicks,
    selectWinners,
    selectCurrentYear,
    selectCurrentSeason,
} from '../index';

describe('selectGames', () => {
    it('should select games entity from store', () => {
        const expected = { id: 1, };
        const store = {
            entities: {
                games: expected,
            },
        };
        expect(selectGames(store)).toBe(expected);
    });
});

describe('selectTeamSeasons', () => {
    it('should select teamseasons entity from store', () => {
        const expected = { id: 1, };
        const store = {
            entities: {
                teamseasons: expected,
            },
        };
        expect(selectTeamSeasons(store)).toBe(expected);
    });
});

describe('selectParticipants', () => {
    it('should select participants entity from store', () => {
        const expected = { id: 1, };
        const store = {
            entities: {
                participants: expected,
            },
        };
        expect(selectParticipants(store)).toBe(expected);
    });
});

describe('selectWagers', () => {
    it('should select wagers entity from store', () => {
        const expected = { id: 1, };
        const store = {
            entities: {
                wagers: expected,
            },
        };
        expect(selectWagers(store)).toBe(expected);
    });
});

describe('selectSelections', () => {
    it('should select selections entity from store', () => {
        const expected = { id: 1, };
        const store = {
            entities: {
                selections: expected,
            },
        };
        expect(selectSelections(store)).toBe(expected);
    });
});

describe('selectSeasons', () => {
    it('should select seasons entity from store', () => {
        const expected = { id: 1, };
        const store = {
            entities: {
                seasons: expected,
            },
        };
        expect(selectSeasons(store)).toBe(expected);
    });
});

describe('selectCurrentUser', () => {
    it('should select auth\'d user id from store', () => {
        const expected = 1;
        const store = {
            auth: {
                user: {
                    id: expected,
                }
            },
        };
        expect(selectCurrentUser(store)).toBe(expected);
    });
});

describe('selectUsers', () => {
    it('should select users entity from store', () => {
        const expected = { id: 1, };
        const store = {
            entities: {
                users: expected,
            },
        };
        expect(selectUsers(store)).toBe(expected);
    });
});

describe('selectWinners', () => {
    it('should select winners entity from store', () => {
        const expected = { id: 1, };
        const store = {
            entities: {
                winners: expected,
            },
        };
        expect(selectWinners(store)).toBe(expected);
    });
});

describe('selectMatchupOrdering', () => {
    it('should select the ui chosen matchup ordering from store', () => {
        const expected = [1, 2, 3];
        const store = {
            ui: {
                makePicksOrdering: {
                    matchupOrdering: expected,
                }
            },
        };
        expect(selectMatchupOrdering(store)).toBe(expected);
    });
});

describe('selectCurrentUIPicks', () => {
    it('should select the ui chosen picks from store', () => {
        const expected = { examplePicks: 1 };
        const store = {
            ui: {
                makePicksOrdering: {
                    picks: expected,
                }
            },
        };
        expect(selectCurrentUIPicks(store)).toBe(expected);
    });
});

describe('selectCurrentSeason', () => {
    it('should return null when there is no match', () => {
        const expected = null;
        const currentYear = 2016;
        const seasons = {};
        const store = {
            ui: {
                currentYear,
            },
            entities: {
                seasons,
            }
        };
        expect(selectCurrentSeason(store)).toBe(expected);
    });
});
