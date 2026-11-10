export function Brand({ compact = false }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`} translate="no">
    <span className="brand-mark" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 34 34" fill="none"><path d="M11 4H7a3 3 0 0 0-3 3v4m19-7h4a3 3 0 0 1 3 3v4M4 23v4a3 3 0 0 0 3 3h4m19-7v4a3 3 0 0 1-3 3h-4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><path d="M12 23c-3-6 0-11 11-12 0 10-5 15-11 12Zm0 0 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
    <span className="brand-word">Agri<span>Vision</span><small>PINEAPPLE CARE</small></span>
  </div>;
}
