import React, {
    Component
} from 'react';
import PropTypes from 'prop-types';
import {
    Table,
    Grid,
} from 'react-bootstrap';
import moment from 'moment';

class GameRow extends Component {
    static propTypes = {
        name: PropTypes.string.isRequired,
        date: PropTypes.string.isRequired,
    };

    render() {
        const {
            name,
            date,
        } = this.props;
        return (
            <tr>
                <td>{date}</td>
                <td>{name}</td>
            </tr>
        );
    }
}

class GameTable extends Component {
    static propTypes = {
        games: PropTypes.arrayOf(
            PropTypes.shape({
                id: PropTypes.any,
                name: PropTypes.string,
                date: PropTypes.instanceOf(Date),
            })
        )
    };

    render() {
        const {
            games
        } = this.props;
        if (!games) {
            return <div>Fetching...</div>;
        }
        const gameRows = games.map((game) => {
            return (
                <GameRow
                key={game.id}
                name={game.name}
                date={moment(game.date).format('lll')}
                />
            );
        });
        return (
            <Grid>
                <Table>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        { gameRows }
                    </tbody>
                </Table>
            </Grid>
        );
    }
}

export default GameTable;
