import React, {
    Component
} from 'react';
import {
    Row,
    Col,
    Grid,
    ListGroup,
} from 'react-bootstrap';

class HistoryPage extends Component {
    render() {
        const { seasons } = this.props;
        const rows = seasons.map((season) => {
            return (
                    season.link
            );
        });
        return (
            <Grid>
                <Row>
                    <Col>
                        <ListGroup componentClass='ul'>
                            {rows}
                        </ListGroup>
                    </Col>
                </Row>
            </Grid>
        );
    }
}

export default HistoryPage;
