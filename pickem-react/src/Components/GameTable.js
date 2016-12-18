import React, {
    Component
} from 'react';
import {
    Table
} from 'react-bootstrap';
import moment from 'moment';

class GameRow extends Component {
    static propTypes = {
        name: React.PropTypes.string.isRequired,
        date: React.PropTypes.string.isRequired,
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
        games: React.PropTypes.arrayOf(
            React.PropTypes.shape({
                id: React.PropTypes.any,
                name: React.PropTypes.string,
                date: React.PropTypes.instanceOf(Date),
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
        );
    }
}

export default GameTable;
