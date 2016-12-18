// The schema expected from pickem API
import {
    Schema,
    arrayOf,
} from 'normalizr';

const datetime = new Schema('datetime');
const event = new Schema('event');
const fixedWagerAmount = new Schema('fixed_wager_amount');
const url = new Schema('url');
const season = new Schema('season');
const gameSchema = new Schema('games');
gameSchema.define({
    datetime: datetime,
    event: event,
    fixedWagerAmount: fixedWagerAmount,
    season: season,
    url: url
});

const Schemas = {
    GAME: gameSchema,
    GAME_ARRAY: arrayOf(gameSchema),
};

export default Schemas;
