import React from 'react';
import ReactDOM from 'react-dom';
import App from '../src/App';
import { PickData } from '../src/App';

it('renders without crashing', () => {
  const div = document.createElement('div');
  ReactDOM.render(<App />, div);
});

describe("PickData", () => {
    it('should display unranked team', () => {
        const pick = new PickData(1, "A");
        expect(pick.id).toBe(1);
        expect(pick.toString()).toBe("A");
    });

    it('should display ranked team', () => {
        const pick = new PickData(1, "A", 2);
        expect(pick.id).toBe(1);
        expect(pick.toString()).toBe("(2) A");
    });
});
