// DI of the answer drafter port, sibling of `RepositoriesProvider`: the composition root
// decides WHICH drafter (LLM, rule-based) runs; containers only see the port.

import * as React from 'react';
import type { AnswerDrafter } from '../domain/ports/answerDrafter.port';

const AnswerDrafterContext = React.createContext<AnswerDrafter | null>(null);

export function AnswerDrafterProvider(props: {
  readonly drafter: AnswerDrafter;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return React.createElement(AnswerDrafterContext.Provider, { value: props.drafter, children: props.children });
}

export function useAnswerDrafter(): AnswerDrafter {
  const value = React.useContext(AnswerDrafterContext);
  if (value === null) {
    throw new Error('useAnswerDrafter() outside <AnswerDrafterProvider>: no drafter to inject.');
  }
  return value;
}
