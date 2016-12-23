// From: https://github.com/reactjs/redux/blob/master/examples/real-world/src/containers/DevTools.js

import React from 'react';
import { createDevTools } from 'redux-devtools';
import LogMonitor from 'redux-devtools-log-monitor';
import DockMonitor from 'redux-devtools-dock-monitor';

export default createDevTools(
    <DockMonitor toggleVisibilityKey='ctrl-h'
                 changePositionKey='ctrl-w'>
        <LogMonitor />
    </DockMonitor>
)
