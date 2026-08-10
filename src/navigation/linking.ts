import type { LinkingOptions } from '@react-navigation/native';

import type { RootStackParamList } from './RootNavigator';

export const navigationLinking: LinkingOptions<RootStackParamList> = {
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
};
