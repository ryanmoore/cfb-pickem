// The schema expected from pickem API
import {
    Schema,
    arrayOf,
} from 'normalizr';

const season = new Schema('seasons');

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
    season: season,
});

const userSchema = new Schema('users');
const participantSchema = new Schema('participants');
const teamseasonSchema = new Schema('teamseasons');
const wagerSchema = new Schema('wagers');
const selectionSchema = new Schema('selections');

participantSchema.define({
    teamseason: teamseasonSchema,
});

wagerSchema.define({
    user: userSchema,
    game: gameSchema,
});

selectionSchema.define({
    user: userSchema,
    participant: participantSchema,
});

const Schemas = {
    GAME: gameSchema,
    GAME_ARRAY: arrayOf(gameSchema),
    USER: userSchema,
    USER_ARRAY: arrayOf(userSchema),
    PARTICIPANT: participantSchema,
    PARTICIPANT_ARRAY: arrayOf(participantSchema),
    TEAMSEASON: teamseasonSchema,
    TEAMSEASON_ARRAY: arrayOf(teamseasonSchema),
    SELECTION: selectionSchema,
    SELECTION_ARRAY: arrayOf(selectionSchema),
    WAGER: wagerSchema,
    WAGER_ARRAY: arrayOf(wagerSchema),
};

export default Schemas;
