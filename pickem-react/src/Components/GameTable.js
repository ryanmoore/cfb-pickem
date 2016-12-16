import React, {
    Component
} from 'react';
import {
    Table
} from 'react-bootstrap';

class GameRow extends Component {
    render() {
        const {
            id,
            left,
            right,
            date,
            name
        } = this.props;
        return (
            <tr>
                <td>{id}</td>
                <td>{date}</td>
                <td>{name}</td>
                <td>{left.toString()}</td>
                <td>{right.toString()}</td>
            </tr>
        );
    }
}

class GameTable extends Component {
    render() {
        const {
            games
        } = this.props;
        const gameRows = games.map((game) => {
            return <GameRow
                    key={game.id}
                    id={game.id}
                    left={game.left}
                    right={game.right}
                    date='TODO'
                    name='TODO'
            />
        });
        return (
            <Table>
                <thead>
                    <tr>
                        <th>id</th>
                        <th>Date</th>
                        <th>Name</th>
                        <th>Left</th>
                        <th>Right</th>
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
