import { useMemo, useState } from 'react';

type ConsoleOption = { id: string; label: string };
type ConsoleInfo = { family: string; era: string };
const INFO: Record<string, ConsoleInfo> = {
  '3ds': { family: 'Nintendo', era: '2011 · handheld' }, dreamcast: { family: 'Sega', era: '1998 · home' },
  gb: { family: 'Nintendo', era: '1989 · handheld' }, gba: { family: 'Nintendo', era: '2001 · handheld' }, gbc: { family: 'Nintendo', era: '1998 · handheld' },
  gc: { family: 'Nintendo', era: '2001 · home' }, genesis: { family: 'Sega', era: '1988 · home' }, n64: { family: 'Nintendo', era: '1996 · home' },
  nds: { family: 'Nintendo', era: '2004 · handheld' }, nes: { family: 'Nintendo', era: '1983 · home' },
  ps1: { family: 'PlayStation', era: '1994 · home' }, ps2: { family: 'PlayStation', era: '2000 · home' }, psp: { family: 'PlayStation', era: '2004 · handheld' },
  psvita: { family: 'PlayStation', era: '2011 · handheld' }, saturn: { family: 'Sega', era: '1994 · home' }, snes: { family: 'Nintendo', era: '1990 · home' },
  wii: { family: 'Nintendo', era: '2006 · home' }, ps4: { family: 'PlayStation', era: '2013 · home' }, ps5: { family: 'PlayStation', era: '2020 · home' },
  switch: { family: 'Nintendo', era: '2017 · hybrid' }, 'xbox-one': { family: 'Xbox', era: '2013 · home' },
  'xbox-series': { family: 'Xbox', era: '2020 · home' }, pc: { family: 'PC', era: 'multi-generation' },
};

export function GameConsoleSelector({ options, value, onChange }: { options: ConsoleOption[]; value: string; onChange: (id: string) => void }) {
  const [family, setFamily] = useState('All families');
  const families = useMemo(() => ['All families', ...Array.from(new Set(options.map(option => INFO[option.id]?.family || 'Other')))], [options]);
  const visible = family === 'All families' ? options : options.filter(option => (INFO[option.id]?.family || 'Other') === family);
  return <div className="console-selector">
    <div className="console-family-tabs" role="group" aria-label="Console family">{families.map(name => <button type="button" key={name} className={family === name ? 'active' : ''} aria-pressed={family === name} onClick={() => setFamily(name)}>{name}</button>)}</div>
    <div className="console-rail" role="group" aria-label="Choose a console">
      <button type="button" className={'console-option console-option-all' + (value === 'all' ? ' active' : '')} aria-pressed={value === 'all'} onClick={() => onChange('all')}><strong>All systems</strong><small>Every indexed console</small></button>
      {visible.map(option => {
        const info = INFO[option.id] || { family: 'Other', era: 'catalogued system' };
        return <button type="button" key={option.id} className={'console-option console-select' + (value === option.id ? ' active' : '')} aria-pressed={value === option.id} onClick={() => onChange(option.id)}><strong>{option.label}</strong><small>{info.family} · {info.era}</small></button>;
      })}
    </div>
  </div>;
}
