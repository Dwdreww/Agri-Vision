// Original vector artwork shared by the journal, sign-in, and scan screens.
export function PineappleMark({ className = '', size = 40 }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 64 80" fill="none" aria-hidden="true" focusable="false">
    <path d="M31 33C20 26 18 15 18 15l13 9L29 3l10 21 12-11-5 19" fill="var(--art-leaf, currentColor)" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
    <path d="M19 34c7-5 21-5 27 1 7 7 7 24 2 33-5 10-25 10-31 0-5-9-5-26 2-34Z" fill="var(--art-fruit, #edc461)" stroke="currentColor" strokeWidth="2.4" />
    <path d="m19 36 28 30M15 45l25 29M28 32l24 27M44 35 17 66M51 44 25 74M34 32 14 55" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".65" />
  </svg>;
}

function Plant({ x, y, scale = 1 }) {
  return <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <path d="M0 42C-34 27-48 1-50-14-25-7-9 9 0 31-4 5 3-23 15-41c10 21 11 44-1 72 13-20 32-31 54-33-9 23-26 39-54 45" fill="var(--art-leaf, #41664a)" stroke="var(--art-ink, #2b4637)" strokeWidth="2" strokeLinejoin="round" />
    <path d="m4 14-18-31 21 9L11-35 23-9l20-9-13 35" fill="var(--art-leaf-light, #82935d)" stroke="var(--art-ink, #2b4637)" strokeWidth="2" />
    <path d="M-3 15c7-6 20-7 27-1 9 8 8 26 3 35-5 9-22 10-29 1-7-9-9-26-1-35Z" fill="var(--art-fruit, #e8b64e)" stroke="var(--art-ink, #2b4637)" strokeWidth="2" />
    <path d="m0 18 26 28M-7 29l22 26M11 10l22 25M24 15-3 47M31 25 8 55M13 10-8 33" stroke="var(--art-ink, #2b4637)" opacity=".55" strokeWidth="1.5" />
  </g>;
}

export function FieldIllustration({ className = '', compact = false }) {
  return <svg className={`field-illustration ${className}`} viewBox="0 0 540 270" fill="none" aria-hidden="true" focusable="false">
    <circle cx="408" cy="68" r="34" fill="var(--art-sun, #df9164)" />
    <path d="M27 140c80-58 136-38 214-18 85 22 158-59 273-18v150H27Z" fill="var(--art-hill, #c5c495)" />
    <path d="M12 193c98-66 189-18 273 2 90 22 155-35 241-51v111H12Z" fill="var(--art-soil, #e0b87d)" />
    <g stroke="var(--art-ink, #2b4637)" strokeWidth="1.5" strokeLinecap="round" opacity=".45">
      <path d="M19 225c124-68 216 48 343 5 60-20 102-42 158-42M20 243c124-68 216 48 343 5 60-20 102-42 158-42M17 208c124-68 216 48 343 5 60-20 102-42 158-42" />
      {!compact && <><path d="M61 66h42m-21-21v42M270 42h24m-12-12v24" /><path d="M351 89c10-9 17-9 27 0M378 89c10-9 17-9 27 0" /></>}
    </g>
    <Plant x={111} y={137} scale={1.1} /><Plant x={278} y={154} scale={1.35} /><Plant x={436} y={124} scale={.9} />
  </svg>;
}
