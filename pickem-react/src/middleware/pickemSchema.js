// The schema expected from pickem API
import {
    schema,
} from 'normalizr';

const season = new schema.Entity('seasons');

// Events are poorly designed server side since their PK is the event name
// which can have dots and spaces. We don't need to normalize them for now,
// so we will just pull out the name
const gameSchema = new schema.Entity('games', {
    assignEntity: (output, key, value, input) => {
        if(key === 'event') {
            output[key] = input[key].name;
        }
    }
});

gameSchema.define({
    season: season,
});

const userSchema = new schema.Entity('users');
const participantSchema = new schema.Entity('participants');
const teamseasonSchema = new schema.Entity('teamseasons');
const wagerSchema = new schema.Entity('wagers');
const selectionSchema = new schema.Entity('selections');
const winnerSchema= new schema.Entity('winners');
const authTokenSchema = new schema.Entity('auth');
const submitResponseSchema = new schema.Entity('submit');
const seasonSchema = new schema.Entity('seasons');
const progressSchema = new schema.Entity('progress');

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

winnerSchema.define({
    participant: participantSchema,
});

authTokenSchema.define({
    user: userSchema,
});

progressSchema.define({
    user: userSchema,
});

const Schemas = {
    GAME: gameSchema,
    GAME_ARRAY: new schema.Array(gameSchema),
    USER: userSchema,
    USER_ARRAY: new schema.Array(userSchema),
    PARTICIPANT: participantSchema,
    PARTICIPANT_ARRAY: new schema.Array(participantSchema),
    TEAMSEASON: teamseasonSchema,
    TEAMSEASON_ARRAY: new schema.Array(teamseasonSchema),
    SELECTION: selectionSchema,
    SELECTION_ARRAY: new schema.Array(selectionSchema),
    WAGER: wagerSchema,
    WAGER_ARRAY: new schema.Array(wagerSchema),
    WINNER: winnerSchema,
    WINNER_ARRAY: new schema.Array(winnerSchema),
    SEASON: seasonSchema,
    SEASON_ARRAY: new schema.Array(seasonSchema),
    AUTH_TOKEN_RESPONSE: authTokenSchema,
    SUBMIT_RESPONSE: submitResponseSchema,
    PROGRESS_ARRAY: new schema.Array(progressSchema),
};

export default Schemas;
