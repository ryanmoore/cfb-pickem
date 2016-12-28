import React, { Component } from 'react';
import { Grid } from 'react-bootstrap';

export default class PageNotFound extends Component {
    render() {
        return (
            <Grid>
                <h2>Oops!</h2>
                <h3>404 page not found.</h3>
                <p>We are sorry but the page you are looking for does not exist.</p>
            </Grid>);
    }
}
