import React from 'react';
import {
    connect,
} from 'react-redux';
import {
    loginFormUpdateUsername,
    loginFormUpdatePassword,
    fetchPickemAuthToken,
} from '../actions';
import LoginForm from '../Components/LoginForm';

const selectUsernameField = (state) => state.ui.loginForm.username
const selectPasswordField = (state) => state.ui.loginForm.password

const mapStateToProps = (state) => {
    return {
        usernameFieldValue: selectUsernameField(state),
        passwordFieldValue: selectPasswordField(state),
    };
}

const onSubmitAction = () => (dispatch, getState) => {
    const state = getState();
    return dispatch(fetchPickemAuthToken({
        username: selectUsernameField(state),
        password: selectPasswordField(state),
    }));
}

const mapDispatchToProps = (dispatch) => {
    return {
        usernameOnChange: (event) => {
            dispatch(loginFormUpdateUsername(event.target.value));
        },
        passwordOnChange: (event) => {
            dispatch(loginFormUpdatePassword(event.target.value));
        },
        onSubmit: (event) => {
            event.preventDefault();
            dispatch(onSubmitAction());
        }
    };
}

export default connect(mapStateToProps, mapDispatchToProps)(LoginForm);
