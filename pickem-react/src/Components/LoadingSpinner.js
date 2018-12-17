import React, { Component } from 'react';
import Spinner from 'react-spinkit';
import { Grid, Col, Row } from 'react-bootstrap';
import './LoadingSpinner.css';

export default class LoadingSpinner extends Component {
    render() {
        //TODO: Center within Container
        return (<Grid>
                    <Row>
                        <Col xs={12}>
                            <Spinner className='spinner center' name='three-bounce' />
                        </Col>
                    </Row>
                </Grid>
        );
    }
}
