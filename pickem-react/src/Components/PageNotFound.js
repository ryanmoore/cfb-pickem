import PropTypes from 'prop-types';
import React, { Component } from 'react';
import { Grid } from 'react-bootstrap';

export default class PageNotFound extends Component {
    static propTypes = {
        from: PropTypes.string,
    }

    render() {
        const from = this.props.from;
        var debug;
        if(process.env.NODE_ENV !== 'production' && from) {
            debug = <h2>from: { from }</h2>;
        }
        return (
            <Grid>
                { debug }
                <h2>Oops!</h2>
                <h3>404 page not found.</h3>
                <p>We are sorry but the page you are looking for does not exist.</p>
            </Grid>);
    }
}
