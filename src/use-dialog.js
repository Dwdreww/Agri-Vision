import { useEffect, useRef } from 'react';

const focusableSelector = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

// Shared by the introductory walkthrough, edit forms, and mobile navigation.
export function useDialog(open, onClose) {
  const ref = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () => [...dialog.querySelectorAll(focusableSelector)].filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
    const focusFirst = () => (controls()[0] || dialog).focus({ preventScroll: true });
    focusFirst();

    function keydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current?.();
      }
      if (event.key !== 'Tab') return;
      const elements = controls();
      const first = elements[0];
      const last = elements.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    }
    function containFocus(event) { if (!dialog.contains(event.target)) focusFirst(); }
    document.addEventListener('keydown', keydown);
    document.addEventListener('focusin', containFocus);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('focusin', containFocus);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      else document.getElementById('main-content')?.focus({ preventScroll: true });
    };
  }, [open]);

  return ref;
}
