import PropTypes from 'prop-types';
import React, {
    Component
} from 'react';
import {
    Grid,
    FormGroup,
    ControlLabel,
    FormControl,
    Button,
    Alert,
} from 'react-bootstrap';
import MaybeErrorAlert from './MaybeErrorAlert';
import './LoginForm.css';

export default class LoginForm extends Component {
    static propTypes = {
            usernameOnChange: PropTypes.func.isRequired,
            passwordOnChange: PropTypes.func.isRequired,
            onSubmit: PropTypes.func.isRequired,
            usernameFieldValue: PropTypes.string,
            passwordFieldValue: PropTypes.string,
            maybeErrors: PropTypes.node,
        }
        // TODO: old username input had fields 'required' and 'autofocus'
        // Those needed here?
    render() {
        const {
            usernameOnChange,
            passwordOnChange,
            usernameFieldValue,
            passwordFieldValue,
            onSubmit,
            maybeErrors,
        } = this.props;
        return (
            <Grid>
                    <form className='form-signin' onSubmit={onSubmit}>
                        <h2 className='form-signin-heading'>Pickem</h2>
                        <MaybeErrorAlert message={maybeErrors}/>
                        <FormGroup controlId='usernameField'>
                            <ControlLabel>Username</ControlLabel>
                            <FormControl type='text' 
                                value={usernameFieldValue}
                                onChange={usernameOnChange}
                                placeholder='username'
                                maxLength={254}
                                required
                                autoFocus
                            />
                        </FormGroup>
                        <FormGroup controlId='passwordField'>
                            <ControlLabel>Password</ControlLabel>
                            <FormControl type='password'
                                placeholder='password'
                                value={passwordFieldValue}
                                onChange={passwordOnChange}
                                required
                            />
                        </FormGroup>
                        <Button type='submit'
                            value='login'
                            bsSize='large'
                            bsStyle='primary'
                            onClick={onSubmit}
                            block
                        >
                            Sign In
                        </Button>
                    </form>
                </Grid>
        );
    }
}
