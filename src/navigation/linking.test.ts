import assert from 'node:assert/strict';
import test from 'node:test';

import { navigationLinking } from './linking';

test('Health Connect privacy URI maps only to Profile Privacy', () => {
  assert.deepEqual(navigationLinking, {
    prefixes: ['eatlog://'],
    config: {
      screens: {
        Tabs: {
          screens: {
            Profile: {
              screens: {
                Privacy: 'privacy',
              },
            },
          },
        },
      },
    },
  });
});
