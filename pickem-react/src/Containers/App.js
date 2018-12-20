import React, {
    Component
} from 'react';
import './App.css';
import {
    Provider
} from 'react-redux';
import PickemRouter from '../Containers/PickemRouter';
import configureStore from '../store/configureStore';
import { DragDropContextProvider } from 'react-dnd';
import {
    default as TouchBackend
} from 'react-dnd-touch-backend';
import HTML5Backend from 'react-dnd-html5-backend';

let { store } = configureStore();


// TODO: Seems we rarely take the html5 backend. Not working in chrome at
// least on dev machine
var dndBackend;
if ('ontouchstart' in window) {
    dndBackend = TouchBackend({
        enableMouseEvents: true
    });
} else {
    dndBackend = HTML5Backend;
}


class App extends Component {
    render() {
        return (
            <Provider store={store}>
                <DragDropContextProvider backend={dndBackend}>
                    <PickemRouter/>
                </DragDropContextProvider>
            </Provider>
        );
    }
}

export default App;
