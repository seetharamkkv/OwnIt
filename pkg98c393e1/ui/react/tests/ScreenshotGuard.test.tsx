/*
 * Screenshot and print deterrence (policy `blockScreenshots`): Print Screen clears the clipboard, hides the work and
 * logs it; Ctrl/Cmd+P and Ctrl/Cmd+S are cancelled and logged; losing window focus hides the work; the policy off
 * leaves everything alone. Runs the real LockdownProvider in offline mode (no server calls).
 */
import * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { LockdownProvider } from '@/features/integrity/LockdownProvider';
import { classifyKey } from '@/features/integrity/useScreenshotGuard';
import type { EduIntegrityPolicy } from '@/common/eduTypes';

jest.mock('@/c3Action', () => ({ c3Call: jest.fn(async () => null) }));

const writeText = jest.fn(() => Promise.resolve());
beforeAll(() => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});
beforeEach(() => {
  writeText.mockClear();
  jest.spyOn(document, 'hasFocus').mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());

function renderWork(policy: EduIntegrityPolicy) {
  return render(
    <LockdownProvider
      policy={policy}
      context={{ contextKind: 'ASSIGNMENT', contextId: 'playground-test', courseId: 'c1' }}
      student={{ name: 'Sam Student', studentNumber: '2026-0417' }}
      courseCode="CS101"
    >
      <textarea aria-label="answer" defaultValue="def load_data(path): ..." />
    </LockdownProvider>
  );
}

const ON: EduIntegrityPolicy = { blockScreenshots: true, hideWatermark: true, allowContextMenu: true };
const OFF: EduIntegrityPolicy = { blockScreenshots: false, hideWatermark: true, allowContextMenu: true };

describe('classifyKey', () => {
  it('recognises screenshot and print shortcuts', () => {
    expect(classifyKey({ key: 'PrintScreen', ctrlKey: false, metaKey: false, shiftKey: false })).toBe('screenshot');
    expect(classifyKey({ key: 'S', ctrlKey: true, metaKey: false, shiftKey: true })).toBe('screenshot');
    expect(classifyKey({ key: 'p', ctrlKey: false, metaKey: true, shiftKey: false })).toBe('print');
    expect(classifyKey({ key: 's', ctrlKey: true, metaKey: false, shiftKey: false })).toBe('print');
    expect(classifyKey({ key: 'a', ctrlKey: true, metaKey: false, shiftKey: false })).toBeNull();
    expect(classifyKey({ key: 's', ctrlKey: false, metaKey: false, shiftKey: false })).toBeNull();
  });
});

describe('screenshot blocking', () => {
  it('Print Screen clears the clipboard, hides the work for a moment and warns the student', async () => {
    jest.useFakeTimers();
    renderWork(ON);
    const answer = screen.getByLabelText('answer');
    const content = answer.parentElement as HTMLElement;
    expect(content).not.toHaveAttribute('data-capture-hidden');

    act(() => {
      fireEvent.keyUp(window, { key: 'PrintScreen' });
    });

    expect(writeText).toHaveBeenCalledWith('');
    expect(content).toHaveAttribute('data-capture-hidden', 'true');
    expect(screen.getByText('Screenshots are not allowed')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(2_000);
    });
    expect(content).not.toHaveAttribute('data-capture-hidden');
    jest.useRealTimers();
  });

  it('cancels Ctrl+P / Cmd+S and tells the student printing is off', () => {
    renderWork(ON);
    const printed = fireEvent.keyDown(window, { key: 'p', ctrlKey: true });
    expect(printed).toBe(false); // preventDefault was called
    const saved = fireEvent.keyDown(window, { key: 's', metaKey: true });
    expect(saved).toBe(false);
    expect(screen.getAllByText('Printing is turned off').length).toBeGreaterThan(0);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('hides the work while the window does not have focus and shows it again on focus', () => {
    renderWork(ON);
    const content = screen.getByLabelText('answer').parentElement as HTMLElement;
    act(() => {
      fireEvent.blur(window);
    });
    expect(content).toHaveAttribute('data-capture-hidden', 'true');
    expect(screen.getByTestId('capture-shield')).toBeInTheDocument();
    act(() => {
      fireEvent.focus(window);
    });
    expect(content).not.toHaveAttribute('data-capture-hidden');
    expect(screen.queryByTestId('capture-shield')).toBeNull();
  });

  it('does nothing when the policy turns blockScreenshots off', () => {
    renderWork(OFF);
    const content = screen.getByLabelText('answer').parentElement as HTMLElement;
    const printed = fireEvent.keyDown(window, { key: 'p', ctrlKey: true });
    fireEvent.keyUp(window, { key: 'PrintScreen' });
    act(() => {
      fireEvent.blur(window);
    });
    expect(printed).toBe(true);
    expect(writeText).not.toHaveBeenCalled();
    expect(content).not.toHaveAttribute('data-capture-hidden');
    expect(screen.queryByText('Screenshots are not allowed')).toBeNull();
  });
});
