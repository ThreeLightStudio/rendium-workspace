import type { Decorator } from '@storybook/react';
import { LocaleProvider, setLocale } from '../i18n/locale';

export function createLocaleStoryDecorator(): Decorator {
  return (Story) => {
    setLocale('en');

    return (
      <LocaleProvider>
        <Story />
      </LocaleProvider>
    );
  };
}
