import type { Decorator } from '@storybook/react';
import {
  type StorybookFixtureDecoratorOptions,
  createStorybookFixtureDecorator,
} from '../storybook/storybookFixtures';

export function createViewsScenarioDecorator(
  options: StorybookFixtureDecoratorOptions,
  configure?: () => void,
): Decorator {
  const baseDecorator = createStorybookFixtureDecorator(options);

  return (Story, context) =>
    baseDecorator(() => {
      configure?.();
      return Story();
    }, context);
}
