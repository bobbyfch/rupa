import { useMemo, useState } from 'react';
import { Gamepad2 } from 'lucide-react';

type ConsoleOption = { id: string; label: string };
type ConsoleInfo = { family: string; era: string };
const INFO: Record<string, ConsoleInfo> = {
  '3ds': { family: 'Nintendo', era: '2011 · handheld' }, dreamcast: { family: 'Sega', era: '1998 · home' },
  gb: { family: 'Nintendo', era: '1989 · handheld' }, gba: { family: 'Nintendo', era: '2001 · handheld' }, gbc: { family: 'Nintendo', era: '1998 · handheld' },
  gc: { family: 'Nintendo', era: '2001 · home' }, genesis: { family: 'Sega', era: '1988 · home' }, n64: { family: 'Nintendo', era: '1996 · home' },
  nds: { family: 'Nintendo', era: '2004 · handheld' }, nes: { family: 'Nintendo', era: '1983 · home' },
  ps1: { family: 'PlayStation', era: '1994 · home' }, ps2: { family: 'PlayStation', era: '2000 · home' }, psp: { family: 'PlayStation', era: '2004 · handheld' },
  psvita: { family: 'PlayStation', era: '2011 · handheld' }, saturn: { family: 'Sega', era: '1994 · home' }, snes: { family: 'Nintendo', era: '1990 · home' },
  wii: { family: 'Nintendo', era: '2006 · home' }, ps4: { family: 'PlayStation', era: '2013 · home' }, ps5: { family: 'PlayStation', era: '2020 · home' }, switch2: { family: 'Nintendo', era: '2025 · hybrid' },
  switch: { family: 'Nintendo', era: '2017 · hybrid' }, 'xbox-one': { family: 'Xbox', era: '2013 · home' },
  'xbox-series': { family: 'Xbox', era: '2020 · home' }, pc: { family: 'PC', era: 'multi-generation' },
};

function platformMark(id: string, family: string) {
  if (id === 'all') return <Gamepad2 size={16}/>;
  if (id.startsWith('ps') || family === 'PlayStation') return 'PS';
  if (id.startsWith('xbox') || family === 'Xbox') return 'X';
  if (family === 'Nintendo') return 'N';
  if (id === 'pc') return 'PC';
  if (family === 'Sega') return 'SG';
  return <Gamepad2 size={15}/>;
}

function platformLogo(id: string, family: string) {
  const logo = id.startsWith('ps') || family === 'PlayStation' ? ['playstation','003791']
    : id === 'pc' ? ['steam','171a21']
    : family === 'Sega' ? ['sega','0081c8'] : null;
  return logo ? `https://cdn.simpleicons.org/${logo[0]}/${logo[1]}` : '';
}

function PlatformMark({ id, family }: { id: string; family: string }) {
  const logo = platformLogo(id, family);
  const [logoState, setLogoState] = useState<'loading' | 'ready' | 'failed'>('loading');
  return <span className="console-platform-mark" data-family={family} aria-hidden="true">
    {logo && logoState !== 'failed' && <img src={logo} alt="" loading="lazy" className={logoState === 'ready' ? 'is-ready' : ''} onLoad={() => setLogoState('ready')} onError={() => setLogoState('failed')}/>}
    {logoState !== 'ready' && <span className="console-platform-fallback">{platformMark(id, family)}</span>}
  </span>;
}

export function GameConsoleSelector({ options, value, onChange }: { options: ConsoleOption[]; value: string; onChange: (id: string) => void }) {
  const [family, setFamily] = useState('All families');
  const families = useMemo(() => ['All families', ...Array.from(new Set(options.map(option => INFO[option.id]?.family || 'Other')))], [options]);
  const visible = family === 'All families' ? options : options.filter(option => (INFO[option.id]?.family || 'Other') === family);
  return <div className="console-selector">
    <div className="console-family-tabs" role="group" aria-label="Console family">{families.map(name => <button type="button" key={name} className={family === name ? 'active' : ''} aria-pressed={family === name} onClick={() => setFamily(name)}>{name}</button>)}</div>
    <div className="console-rail" role="group" aria-label="Choose a console">
      <button type="button" className={'console-option console-select console-option-all' + (value === 'all' ? ' active' : '')} aria-pressed={value === 'all'} onClick={() => onChange('all')}><PlatformMark id="all" family="All"/><span className="console-option-copy"><strong>All systems</strong><small>Every indexed console</small></span></button>
      {visible.map(option => {
        const info = INFO[option.id] || { family: 'Other', era: 'catalogued system' };
        return <button type="button" key={option.id} className={'console-option console-select' + (value === option.id ? ' active' : '')} aria-pressed={value === option.id} onClick={() => onChange(option.id)}><PlatformMark id={option.id} family={info.family}/><span className="console-option-copy"><strong>{option.label}</strong><small>{info.family} · {info.era}</small></span></button>;
      })}
    </div>
  </div>;
}
