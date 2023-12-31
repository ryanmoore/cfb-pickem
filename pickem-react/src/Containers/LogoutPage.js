import PropTypes from 'prop-types';
import { Component } from 'react';
import { logUserOut } from '../actions';
import { connect } from 'react-redux';
import { routerActions } from 'react-router-redux';

class LogoutPage extends Component {
    static propTypes = {
        dispatch: PropTypes.func.isRequired,
    };
    // eslint-disable-next-line camelcase
    UNSAFE_componentWillMount() {
        this.props.dispatch(logUserOut())
        this.props.dispatch(routerActions.push('/'));
    }
    render() {
        return null;
    }
}

export default connect()(LogoutPage);
