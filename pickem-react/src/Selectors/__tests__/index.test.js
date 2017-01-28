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
    selectGamesForCurrentSeason,
} from '../index';

describe('selectGames', () => {
    it('should select games entity from store', () => {
        const expected = {
            id: 1,
        };
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
        const expected = {
            id: 1,
        };
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
        const expected = {
            id: 1,
        };
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
        const expected = {
            id: 1,
        };
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
        const expected = {
            id: 1,
        };
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
        const expected = {
            id: 1,
        };
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
        const expected = {
            id: 1,
        };
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
        const expected = {
            id: 1,
        };
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

describe('selectCurrentYear', () => {
    it('should select the ui chosen year from store', () => {
        const expected = 2017;
        const store = {
            ui: {
                currentYear: expected,
            },
        };
        expect(selectCurrentYear(store)).toBe(expected);
    });
});

describe('selectCurrentUIPicks', () => {
    it('should select the ui chosen picks from store', () => {
        const expected = {
            examplePicks: 1
        };
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
    it('should return null when there are no seasons', () => {
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
    it('should return a season id when there is a match', () => {
        const expected = 1;
        const currentYear = 2016;
        const seasons = {
            1: {
                year: 2016
            }
        };
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
    it('should return null if there is no match', () => {
        const expected = null;
        const currentYear = 2017;
        const seasons = {
            1: {
                year: 2016
            }
        };
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

describe('selectGamesForCurrentSeason', () => {
    it('should return empty obj when there are no games', () => {
        const expected = {};
        const currentYear = 2017;
        const seasons = {
            1: {
                year: currentYear,
            }
        };
        const games = {};
        const store = {
            ui: {
                currentYear,
            },
            entities: {
                seasons,
                games,
            },
        };
        expect(selectGamesForCurrentSeason(store)).toEqual(expected);
    });
    it('should return a formatted game when one is found', () => {
        const dateStr = '2017-01-01';
        const expected = {
            2: {
                id: 2,
                gameDetails: {
                    fixedWagerAmount: 7,
                    eventName: 'Test Event',
                    date: new Date(dateStr),
                }
            }
        };
        const currentYear = 2017;
        const seasons = {
            1: {
                year: currentYear,
            }
        };
        const games = {
            2: {
                id: 2,
                fixed_wager_amount: 7,
                event: 'Test Event',
                datetime: dateStr,
                season: 1,
            }
        };
        const store = {
            ui: {
                currentYear,
            },
            entities: {
                seasons,
                games,
            },
        };
        expect(selectGamesForCurrentSeason(store)).toEqual(expected);
    });
    it('should return empty if only games for other seasons exist', () => {
        const dateStr = '2017-01-01';
        const expected = {};
        const currentYear = 2017;
        const seasons = {
            1: {
                year: currentYear,
            }
        };
        const games = {
            2: {
                id: 2,
                fixed_wager_amount: 7,
                event: 'Test Event',
                datetime: dateStr,
                season: 2,
            }
        };
        const store = {
            ui: {
                currentYear,
            },
            entities: {
                seasons,
                games,
            },
        };
        expect(selectGamesForCurrentSeason(store)).toEqual(expected);
    });
    it('should return two games two match current season and one does not',
        () => {
            const dateStr1 = '2017-01-01';
            const dateStr2 = '2017-01-02';
            const expected = {
                2: {
                    id: 2,
                    gameDetails: {
                        fixedWagerAmount: 7,
                        eventName: 'Test Event',
                        date: new Date(dateStr1),
                    }
                },
                4: {
                    id: 4,
                    gameDetails: {
                        fixedWagerAmount: 9,
                        eventName: 'Test Event 4',
                        date: new Date(dateStr2),
                    }
                }
            };
            const currentYear = 2017;
            const seasons = {
                1: {
                    year: currentYear,
                }
            };
            const games = {
                2: {
                    id: 2,
                    fixed_wager_amount: 7,
                    event: 'Test Event',
                    datetime: dateStr1,
                    season: 1,
                },
                3: {
                    id: 3,
                    fixed_wager_amount: 8,
                    event: 'Test Event 2',
                    datetime: dateStr1,
                    season: 2,
                },
                4: {
                    id: 4,
                    fixed_wager_amount: 9,
                    event: 'Test Event 4',
                    datetime: dateStr2,
                    season: 1,
                }
            };
            const store = {
                ui: {
                    currentYear,
                },
                entities: {
                    seasons,
                    games,
                },
            };
            expect(selectGamesForCurrentSeason(store)).toEqual(expected);
        });
});
