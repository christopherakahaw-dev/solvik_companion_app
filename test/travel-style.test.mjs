import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERSONAS } from '../src/lib/persona.js';
import { loadPreferences, savePreferences } from '../src/lib/storage.js';

test('PERSONAS have been updated to the requested travel style names', () => {
  assert.equal(PERSONAS.fixed.name, 'Fixed Schedule');
  assert.equal(PERSONAS.flexible.name, 'Flexible and Multi-Modal');
  assert.equal(PERSONAS.stepFree.name, 'Easy and Accessible');
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
