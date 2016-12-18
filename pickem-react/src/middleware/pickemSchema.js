// The schema expected from pickem API
import {
    Schema,
    arrayOf,
} from 'normalizr';

const datetime = new Schema('datetime');
//const event = new Schema('event');
const fixedWagerAmount = new Schema('fixed_wager_amount');
const url = new Schema('url');
const season = new Schema('season');

// Events are poorly designed server side since their PK is the event name
// which can have dots and spaces. We don't need to normalize them for now,
// so we will just pull out the name
const gameSchema = new Schema('games', {
    assignEntity: (output, key, value, input) => {
        if(key === 'event') {
            output[key] = input[key].name;
        }
    }
});

gameSchema.define({
    datetime: datetime,
    fixedWagerAmount: fixedWagerAmount,
    season: season,
    url: url
});

const Schemas = {
    GAME: gameSchema,
    GAME_ARRAY: arrayOf(gameSchema),
};

export default Schemas;
