import React, {
    Component
} from 'react';
import PropTypes from 'prop-types';
import {
    Nav,
    Navbar,
    NavItem,
    NavDropdown,
    MenuItem,
} from 'react-bootstrap';
import {
    LinkContainer,
    IndexLinkContainer,
} from 'react-router-bootstrap';
import {
    NavLink,
} from 'react-router-dom';
import {
    connect,
} from 'react-redux';
import {
    VisibleWhenAuth,
    VisibleWhenSuperuser,
    UserIsAuthOrElse,
} from '../auth';
import {
    selectCurrentYear,
} from '../Selectors';
import logo from '../assets/brand/logo/pickem-logo-cropped-transparent.png';
import './PickemApp.css';

class UserGreeting extends Component {
    static propTypes = {
        name: PropTypes.string,
    };
    render() {
        const {
            name
        } = this.props;
        return (<Navbar.Text pullRight>Logged in as: {name}</Navbar.Text>);
    }
}
const DisplayUserGreeting = VisibleWhenAuth(connect((state) => ({
    name: state.auth.user.username,
}))(UserGreeting));

const LogoutLink = () => (<LinkContainer to='/logout'>
                            <NavItem eventKey={5}>Logout</NavItem>
                        </LinkContainer>);
const LoginLink = () => (<LinkContainer to='/login'>
                            <NavItem eventKey={6}>Login</NavItem>
                        </LinkContainer>);
const LoginOrOutLink = UserIsAuthOrElse(LogoutLink, LoginLink);


class AdminMenu extends Component {
    static propTypes = {
        baseKey: PropTypes.number.isRequired,
        year: PropTypes.number.isRequired,
    };

    render() {
        const { baseKey, year } = this.props;
        return (
            <NavDropdown eventKey={baseKey} title='Admin' id='admin-dropdown'>
                <LinkContainer to={`/${year}/admin/addwinner`}>
                    <MenuItem eventKey={baseKey + .1}>Add winner</MenuItem>
                </LinkContainer>
                <MenuItem eventKey={baseKey + .2}>Another action</MenuItem>
            </NavDropdown>
        );
    }
}

const AdminNavItem = VisibleWhenSuperuser((props) => (
    <AdminMenu year={props.year} baseKey={props.baseKey} />
));

class PickemApp extends Component {
    static propTypes = {
        children: PropTypes.node,
        year: PropTypes.number,
    }
    render() {
        const yearMaybe = this.props.year;
        const year = yearMaybe ? yearMaybe : 2017;
        return (
            <div>
                <Navbar bsStyle='default' fixedTop collapseOnSelect >
                    <Navbar.Header>
                        <Navbar.Brand className='pickem-logo'>
                            <NavLink to={'/'}>
                                <img className='pickem-logo-img' src={logo} alt='Pickem'/>
                            </NavLink>
                        </Navbar.Brand>
                        <Navbar.Text className='pickem-navbar-year'>
                            {year}
                        </Navbar.Text>
                        <Navbar.Toggle />
                    </Navbar.Header>
                    <Navbar.Collapse>
                        <DisplayUserGreeting/>
                        <Nav>
                            <LinkContainer to={`/${year}/index`}>
                                <NavItem eventKey={1}>Schedule</NavItem>
                            </LinkContainer>
                            <LinkContainer to={`/${year}/picks`}>
                                <NavItem eventKey={2}>Picks</NavItem>
                            </LinkContainer>
                            <LinkContainer to={`/${year}/scores`}>
                                <NavItem eventKey={3}>Scores</NavItem>
                            </LinkContainer>
                            <LinkContainer to={'/history'}>
                                <NavItem eventKey={4}>History</NavItem>
                            </LinkContainer>
                            <LinkContainer to={`/${year}/makepicks`}>
                                <NavItem eventKey={5}>MakePicks</NavItem>
                            </LinkContainer>
                            <AdminNavItem year={year} baseKey={6} />
                            <LoginOrOutLink/>
                        </Nav>
                    </Navbar.Collapse>
                </Navbar>
                { this.props.children }
           </div>
        );
    }
}

const mapStateToProps = (state) => ({
   year: selectCurrentYear(state),
});

export default connect(mapStateToProps)(PickemApp);
