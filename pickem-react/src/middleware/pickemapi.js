// Middleware API for Pickem
// Deeply influenced by: https://github.com/reactjs/redux/blob/master/examples/real-world/src/middleware/api.js
//
// To use, create an action of the form:
// {
//  [CALL_PICKEM_API]: {
//      types: {REQ, SUCC, FAIL},
//      endpoint: url,
//      schema: pickemSchema.<expected type>
//  }
//  where:
//      REQ, SUCC, and FAIL are strings that will be used to create actions
//          for when the request begins and when it completes
//      url is either a stub ('foo/bar/2/') or a full URL that should be get'd

import {
    normalize
} from 'normalizr';
import fetch from 'isomorphic-fetch';

const API_ROOT_URL = process.env.REACT_APP_PICKEM_API_ROOT;

// If endpoint is a full URL, return it
// otherwise return root+endpoint
// http://path.to.api/endpoint/ -> http://path.to.api/endpoint/
// foo/ -> http://path.to.api/foo/
const joinUrls = (root, endpoint) => {
    if (endpoint.indexOf(root) !== -1) {
        return endpoint;
    }
    return root + endpoint;
}

const callPickemApi = (endpoint, schema, method = 'GET', headers = {}, callback, body) => {
    const fullUrl = joinUrls(API_ROOT_URL, endpoint);
    // TODO: Real auth
    return fetch(fullUrl, {
            method,
            headers,
            body,
        })
        .then((response) => {
            if(method === 'PUT') {
                return {};
            }
            else {
                return response.json().then(json => {
                    if (!response.ok) {
                        return Promise.reject(json);
                    }
                    if (callback) {
                        return callback(json);
                    }
                    return normalize(json.results, schema);
                })
            }
        });
}

const checkPayload = (endpoint, schema, types) => {
    var errors = [];
    if (typeof endpoint !== 'string') {
        errors.push('PickemMiddleware: Endpoint URL should be a string.');
    }
    if (!schema) {
        errors.push('PickemMiddleware: schema required.');
    }

    if (!Array.isArray(types) || types.length !== 3) {
        errors.push('PickemMiddleware: types must be array length 3.');
    } else if (!types.every(type => typeof type === 'string')) {
        errors.push('PickemMiddleware: action types must be strings.');
    }
    if (errors.length) {
        throw new Error(errors.join('\n\t'));
    }
}

export const CALL_PICKEM_API = Symbol('Call Pickem API');

// The middleware itself
export default store => next => action => {
    // Check if the action contains our middleware key
    const callAPIAction = action[CALL_PICKEM_API];
    if (typeof callAPIAction === 'undefined') {
        return next(action);
    }

    let {
        endpoint
    } = callAPIAction;
    const {
        schema,
        types,
        method,
        body,
        headers,
        callback,
    } = callAPIAction;

    if (typeof endpoint === 'function') {
        endpoint = endpoint(store.getState());
    }

    // throws if there is an error
    checkPayload(endpoint, schema, types);

    // Removes CALL_PICKEM_API from action and updates action with data
    const actionWith = data => {
        const updatedAction = Object.assign({}, action, data);
        delete updatedAction[CALL_PICKEM_API];
        return updatedAction;
    }

    const [requestAction, successAction, failureAction] = types;

    // notify that request has begun
    next(actionWith({
        type: requestAction
    }));

    const handleResponse = (response) => {
        next(actionWith({
            response,
            type: successAction
        }))
    };

    const handleError = (error) => {
        const message = error.message || 'PickemMiddleware: Unknown request error';
        next(actionWith({
            error: message,
            type: failureAction
        }));
    };

    // Perform API call and create action based on result (success or failure)
    return callPickemApi(endpoint, schema, method, headers, callback, body).then(
        handleResponse, handleError);
}
