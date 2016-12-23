import React, {
    Component
} from 'react';
import {
    Grid,
    FormGroup,
    ControlLabel,
    FormControl,
    Button,
} from 'react-bootstrap';
import './LoginForm.css';

export default class LoginForm extends Component {
    static propTypes = {
            usernameOnChange: React.PropTypes.func.isRequired,
            passwordOnChange: React.PropTypes.func.isRequired,
            onSubmit: React.PropTypes.func.isRequired,
            usernameFieldValue: React.PropTypes.string,
            passwordFieldValue: React.PropTypes.string,
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
        } = this.props;
        return (
            <Grid>
                    <form className='form-signin' onSubmit={onSubmit}>
                        <h2 className='form-signin-heading'>Pickem</h2>
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
