import { SCHOOL } from '../../config/school';

// Anything the school has not told us yet is a clearly labelled placeholder. Nothing here is invented:
// the only real facts are the school's name, address, and that it runs JSS 1-3 and SSS 1-3.
export const PLACEHOLDER = '[Placeholder]';
const ph = (what: string) => `${PLACEHOLDER} ${what}`;

export const SECTIONS = ['contact', 'home', 'about', 'academics', 'admissions'] as const;
export type Section = (typeof SECTIONS)[number];

export const DEFAULTS = {
  contact: { phone: '', email: '', whatsapp: '', officeHours: '', mapQuery: SCHOOL.address },
  home: {
    heroTitle: `Welcome to ${SCHOOL.name}`,
    heroSubtitle: ph('Add a short welcome line for visitors.'),
    intro: `${SCHOOL.name} is a secondary school in Mafoluku, Oshodi, Lagos.`,
    highlights: [
      { title: ph('Academic highlight one'), text: ph('Describe something the school is proud of.') },
      { title: ph('Academic highlight two'), text: ph('Describe something the school is proud of.') },
      { title: ph('Academic highlight three'), text: ph('Describe something the school is proud of.') },
    ],
  },
  about: {
    overview: ph('Add a short overview of the school and its history.'),
    mission: ph("Add the school's mission statement."),
    vision: ph("Add the school's vision statement."),
    philosophy: ph("Add the school's educational philosophy."),
    values: [
      { title: ph('Value one'), text: ph('Explain this value.') },
      { title: ph('Value two'), text: ph('Explain this value.') },
      { title: ph('Value three'), text: ph('Explain this value.') },
    ],
    leadership: [{ name: ph('Name'), role: ph('Role, for example Principal'), bio: ph('Add a short biography.') }],
  },
  academics: {
    intro: `${SCHOOL.name} teaches Junior Secondary School (JSS 1 to 3) and Senior Secondary School (SSS 1 to 3).`,
    curriculum: ph('Describe the curriculum the school follows.'),
    programmes: ph('Describe academic programmes, clubs or extra support.'),
  },
  admissions: {
    intro: ph('Explain how admission works at the school.'),
    requirements: [ph('Add each admission requirement as its own line.')],
    process: ph('Describe the steps after an application is received.'),
    openNote: ph('For example: whether admissions for the next session are open.'),
  },
} as const;

export type SiteContent = Record<Section, any>;

// Find every placeholder still showing, so the administrator knows what is left to fill in before launch.
export function findPlaceholders(content: Record<string, unknown>): { section: string; field: string }[] {
  const out: { section: string; field: string }[] = [];
  const walk = (v: unknown, section: string, path: string) => {
    if (typeof v === 'string') { if (v.includes(PLACEHOLDER)) out.push({ section, field: path }); }
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, section, `${path}[${i + 1}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, section, path ? `${path}.${k}` : k);
  };
  for (const [section, v] of Object.entries(content)) walk(v, section, '');
  return out;
}
