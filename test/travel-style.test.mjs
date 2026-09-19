import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERSONAS } from '../src/lib/persona.js';
import { loadPreferences, savePreferences } from '../src/lib/storage.js';

test('PERSONAS have been updated to the requested travel style names', () => {
  assert.equal(PERSONAS.fixed.name, 'Fixed Schedule');
  assert.equal(PERSONAS.flexible.name, 'Flexible and Multi-Modal');
  assert.equal(PERSONAS.stepFree.name, 'Easy and Accessible');
});

test('PERSONAS route labels and schedules match user requirements', () => {
  assert.equal(PERSONAS.fixed.route.label, 'E.g. Tampines (Home) → Raffles Place (Work)');
  assert.equal(PERSONAS.fixed.route.schedule, 'Leave 07:40 arrive by 08:45 , Every Weekday');

  assert.equal(PERSONAS.flexible.route.label, '');
  assert.equal(PERSONAS.flexible.route.schedule, 'Flexible Journeys');

  assert.equal(PERSONAS.stepFree.route.label, '');
  assert.equal(PERSONAS.stepFree.route.schedule, 'Accessible routes tailored to your needs');
});

test('loadPreferences parses and preserves travelStyleSelected', () => {
  const globalStorage = {};
  global.localStorage = {
    getItem: (key) => globalStorage[key] ?? null,
    setItem: (key, val) => { globalStorage[key] = String(val); },
    removeItem: (key) => { delete globalStorage[key]; },
    clear: () => { for (const k in globalStorage) delete globalStorage[k]; },
  };

  savePreferences({
    travelStyle: 'fixed',
    travelStyleSelected: true,
    persona: 'fixed',
    stepFree: false,
  });

  const loaded = loadPreferences();
  assert.equal(loaded.travelStyle, 'fixed');
  assert.equal(loaded.travelStyleSelected, true);
  assert.equal(loaded.persona, 'fixed');
});

test('loadPreferences returns travelStyleSelected: false when not selected', () => {
  const globalStorage = {};
  global.localStorage = {
    getItem: (key) => globalStorage[key] ?? null,
    setItem: (key, val) => { globalStorage[key] = String(val); },
    removeItem: (key) => { delete globalStorage[key]; },
    clear: () => { for (const k in globalStorage) delete globalStorage[k]; },
  };

  savePreferences({
    persona: 'fixed',
    stepFree: false,
  });

  const loaded = loadPreferences();
  assert.equal(loaded.travelStyleSelected, false);
});

test('scenarioCommute respects custom locations and calculated leave times', async () => {
  const { scenarioCommute } = await import('../src/lib/persona.js');

  const customFrom = { id: 'home', name: 'Jurong East', address: 'Jurong East, Singapore', ll: [1.3329, 103.7436] };
  const customTo = { id: 'work', name: 'Marina Bay', address: 'Marina Bay, Singapore', ll: [1.2764, 103.8546] };
  const arriveByMins = 9 * 60; // 09:00
  const travelMins = 42;
  const leaveMins = arriveByMins - travelMins; // 08:18 (498 mins)

  const commute = scenarioCommute('fixed', {
    from: customFrom,
    to: customTo,
    arriveBy: arriveByMins,
    leaveMins,
  });

  assert.equal(commute.fromPlace.label, 'Jurong East');
  assert.equal(commute.toPlace.label, 'Marina Bay');
  assert.equal(commute.arriveBy, 540);
  assert.equal(commute.mins, 498);
});
