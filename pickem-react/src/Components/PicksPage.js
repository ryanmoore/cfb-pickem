import React, {
    Component
} from 'react';
import {
    Row,
    Col,
    Table,
    Grid
} from 'react-bootstrap';
import './PicksPage.css';


class PicksCol extends Component {
    static propTypes = {
        picks: React.PropTypes.arrayOf(
            React.PropTypes.shape({
                username: React.PropTypes.string.isRequired,
                wager: React.PropTypes.number.isRequired,
            })),
        teamName: React.PropTypes.string.isRequired,
        left: React.PropTypes.bool.isRequired,
        winner: React.PropTypes.bool.isRequired,
        decided: React.PropTypes.bool.isRequired,
    }
    render() {
        const {
            picks,
            teamName,
            left,
            winner,
            decided,
        } = this.props;
        const colClass = winner ? 'winning-pick' : decided ? 'losing-pick' : '';
        const tableClass = 'picklist-' + (left ? 'left' : 'right');
        const tableRows = picks.map((pick) => {
            const wager = <td className='wager'>{ pick.wager }</td>;
            const user = <td className='user'>{ pick.username }</td>;
            if (left) {
                return <tr key={pick.username}>{ user }{ wager }</tr>
            } else {
                return <tr key={pick.username}>{ wager }{ user }</tr>
            }
        });
        return (<Col xs={4} className={colClass}>
            <Table className={tableClass}>
                <thead>
                    <tr>
                        <th className='team' colSpan={2}>{ teamName }</th>
                    </tr>
                </thead>
                <tbody>
                    { tableRows }
                </tbody>
            </Table>
        </Col>);
    }
}

class GameDetail extends Component {
    static propTypes = {
        name: React.PropTypes.string.isRequired,
        date: React.PropTypes.instanceOf(Date),
    };
    render() {
        const {
            name,
            date
        } = this.props;
        return (
            <Col xs={4} className='game-details'>
                <p>{ name }<br/>{ date.toString() }</p>
            </Col>
        );
    }
}

class PicksRow extends Component {
    static propTypes = {
        left: React.PropTypes.shape({
            picks: React.PropTypes.array.isRequired,
            teamName: React.PropTypes.string.isRequired,
        }).isRequired,
        right: React.PropTypes.shape({
            picks: React.PropTypes.array.isRequired,
            teamName: React.PropTypes.string.isRequired,
        }).isRequired,
        gameDetails: React.PropTypes.shape({
            eventName: React.PropTypes.string.isRequired,
            date: React.PropTypes.instanceOf(Date).isRequired,
        }).isRequired,
        winner: React.PropTypes.number,
    }
    render() {
        const {
            left,
            right,
            gameDetails,
            winner,
        } = this.props;
        const createPickCol = (pickdata, isLeft) => {
            return <PicksCol picks={ pickdata.picks }
                teamName={ pickdata.teamName }
                left={isLeft}
                winner={pickdata.id === winner}
                decided={!!winner}
            />
        }
        return (
            <Row className='matchup-row'>
                { createPickCol(left, true) }
                <GameDetail name={ gameDetails.eventName } date={ gameDetails.date } />
                { createPickCol(right, false) }
            </Row>
        );
    }
}

class PicksPage extends Component {
    static propTypes = {
        matchupPicks: React.PropTypes.arrayOf(React.PropTypes.shape({
            left: React.PropTypes.any.isRequired,
            right: React.PropTypes.any.isRequired,
            gameDetails: React.PropTypes.any.isRequired,
            id: React.PropTypes.number.isRequired,
            winner: React.PropTypes.number,
        })).isRequired
    };
    render() {
        const {
            matchupPicks
        } = this.props;
        const createRow = (picks) => {
            return <PicksRow key={picks.id}
                left={picks.left}
                right={picks.right}
                gameDetails={picks.gameDetails}
                winner={picks.winner}
                />
        }
        const undecided = matchupPicks.filter((elt) => !elt.winner).map(createRow);
        const decided = matchupPicks.filter((elt) => !!elt.winner).map(createRow);
        return (
            <Grid>
                {undecided}
                <h1>Completed Games</h1>
                {decided}
            </Grid>
        );
    }
}

export default PicksPage;
