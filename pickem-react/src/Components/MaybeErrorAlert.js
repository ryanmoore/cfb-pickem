import PropTypes from 'prop-types';
import React, {
    Component
} from 'react';
import {
    Alert,
} from 'react-bootstrap';

export default class MaybeErrorAlert extends Component {
    static propTypes = {
        message: PropTypes.string,
    };

    render() {
        const { message } = this.props;
        if(!message) {
            return null;
        }
        return (
            <Alert bsStyle="danger"><p>{ message }</p></Alert>
        );
    }
}
