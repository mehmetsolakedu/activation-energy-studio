import { act } from 'react';

export function interpretationCheckbox(
  host: HTMLElement,
): HTMLInputElement | null {
  return host.querySelector<HTMLInputElement>(
    '[data-testid="confirm-interpretation"]',
  );
}

export async function confirmInterpretation(host: HTMLElement): Promise<void> {
  const checkbox = interpretationCheckbox(host);
  if (!checkbox) {
    throw new Error('Interpretation confirmation control was not rendered.');
  }
  if (checkbox.disabled) {
    throw new Error('Interpretation confirmation control is still disabled.');
  }
  if (!checkbox.checked) {
    await act(async () => checkbox.click());
  }
}
