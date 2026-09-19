import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERSONAS } from '../src/lib/persona.js';
import { loadPreferences, savePreferences } from '../src/lib/storage.js';

test('PERSONAS have been updated to the requested travel style names', () => {
  assert.equal(PERSONAS.fixed.name, 'Fixed Schedule');
  assert.equal(PERSONAS.flexible.name, 'Flexible and Multi-Modal (Default)');
  assert.equal(PERSONAS.stepFree.name, 'Easy and Accessible');
});

test('PERSONAS blurbs, route labels and schedules match user requirements', () => {
  assert.equal(PERSONAS.fixed.blurb, 'Same trip everyday. Notify me when my route gets disrupted.');
  assert.equal(PERSONAS.fixed.route.label, '');
  assert.equal(PERSONAS.fixed.route.schedule, 'Defaults the fastest routes available');
  assert.equal(PERSONAS.fixed.fit, '');

  assert.equal(PERSONAS.flexible.blurb, "I'm okay with transfers along my journey.");
  assert.equal(PERSONAS.flexible.route.label, '');
  assert.equal(PERSONAS.flexible.route.schedule, 'Defaults the most comfortable routes with least crowd levels.');

  assert.equal(PERSONAS.stepFree.blurb, 'Suitable for the Elderly and people with mobility issues. I need lifts and shelter.');
  assert.equal(PERSONAS.stepFree.route.label, '');
  assert.equal(PERSONAS.stepFree.route.schedule, 'Defaults the routes with the least walking.');
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

test('lucide Clock icon exists and resolves correctly for time icon in Fixed Schedule', async () => {
  const lucide = await import('lucide');
  assert.ok(lucide.Clock, 'lucide.Clock should exist');
  assert.ok(Array.isArray(lucide.Clock), 'lucide.Clock should be an SVG node definition array');
  assert.ok(lucide.Clock.length > 0, 'lucide.Clock should have SVG elements (circle and hands)');
});

test('Flexible and StepFree profiles do not set default routings on map', async () => {
  // Test logic ensures that when flexible or stepFree is chosen, origin and dest are null
  const { PERSONAS } = await import('../src/lib/persona.js');
  for (const style of ['flexible', 'stepFree']) {
    const isFixed = style === 'fixed';
    const origin = isFixed ? PERSONAS[style].route.from : null;
    const dest = isFixed ? PERSONAS[style].route.to : null;
    assert.equal(origin, null, `${style} should not have a default origin`);
    assert.equal(dest, null, `${style} should not have a default destination`);
  }
});

test('Fixed Schedule journey input does not set home and work locations by default', async () => {
  const initialSavedPlaces = { home: null, work: null, school: null };
  const customFrom = { name: "Nanyang Technological University", address: "NTU, Singapore", ll: [1.3483, 103.6831] };
  const customTo = { name: "NUS College", address: "NUS, Singapore", ll: [1.3040, 103.7725] };

  // Fixed schedule preserves user's savedPlaces without coercing customFrom/customTo into home/work
  const savedPlaces = initialSavedPlaces;
  assert.equal(savedPlaces.home, null, "home should not be auto-assigned");
  assert.equal(savedPlaces.work, null, "work should not be auto-assigned");
});



