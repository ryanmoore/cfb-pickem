import React, { Component } from 'react';
import { logUserOut } from '../actions';
import { connect } from 'react-redux';

class LogoutPage extends Component {
    static propTypes = {
        dispatch: React.PropTypes.func.isRequired,
    };
    componentWillMount() {
        this.props.dispatch(logUserOut());
    }
    render() {
        return null;
    }
}

export default connect()(LogoutPage);
