import PropTypes from 'prop-types';
import React, {
    Component
} from 'react';
import {
    Grid,
} from 'react-bootstrap';
import ScoreTableRow from '../Components/ScoresTableRow';

export default class ScoresTable extends Component {
    static propTypes = {
        scores: PropTypes.arrayOf(
            PropTypes.shape({
                username: PropTypes.string.isRequired,
                score: PropTypes.number.isRequired,
                remaining: PropTypes.number.isRequired,
                achievedPercent: PropTypes.number.isRequired,
                remainderPercent: PropTypes.number.isRequired,
            })
        ).isRequired,
    };
    render() {
        const {
            scores
        } = this.props;
        const sortByAchievedScoreDesc = (a, b) => {
            if(a.score < b.score) return 1;
            if(a.score > b.score) return -1;
            const aTotal = a.score + a.remaining;
            const bTotal = b.score + b.remaining;
            if(aTotal < bTotal) return 1;
            if(aTotal > bTotal) return -1;
            if(b.username < a.username) return 1;
            if(b.username > a.username) return -1;
            return 0;
        };
        var sortedScores = scores.slice(0);
        sortedScores.sort(sortByAchievedScoreDesc);
        const scoreBars = sortedScores.map((score) => {
            return <ScoreTableRow 
                    key={score.username}
                    name={score.username}
                    score={score.score}
                    remainder={score.remaining}
                    achievedPercent={score.achievedPercent}
                    remainderPercent={score.remainderPercent}
                />
        });
        return (<Grid>{scoreBars}</Grid>);
    }
}
