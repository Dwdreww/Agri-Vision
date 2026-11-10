import { useEffect, useId, useState } from 'react';

export default function IconAction({ label, heading, description, children, onClick, disabled }) {
  const helpId = useId();
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    const dismiss = event => {
      if (event.key === 'Escape') setDismissed(true);
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, []);
  return <span className="icon-action" onMouseEnter={() => setDismissed(false)}>
    <button className="icon-button icon-action-trigger" type="button" aria-label={label}
      aria-describedby={helpId} disabled={disabled} onClick={onClick}
      onFocus={() => setDismissed(false)} onKeyDown={event => {
        if (event.key === 'Escape' && !dismissed) {
          setDismissed(true);
          event.stopPropagation();
        }
      }}>{children}</button>
    <span className="icon-action-tooltip" id={helpId} role="tooltip" hidden={dismissed}>
      <span className="icon-action-tooltip-content"><strong>{heading}</strong><span>{description}</span></span>
    </span>
  </span>;
}
