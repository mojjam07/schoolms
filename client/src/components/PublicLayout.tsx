import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { usePublic } from '../lib/useFetch';
import type { SiteData } from '../lib/types';

const NAV = [
  { to: '/', label: 'Home', end: true }, { to: '/about', label: 'About us' }, { to: '/academics', label: 'Academics' },
  { to: '/facilities', label: 'Facilities' }, { to: '/admissions', label: 'Admissions' }, { to: '/news', label: 'News and events' }, { to: '/contact', label: 'Contact us' },
];

export default function PublicLayout() {
  const [open, setOpen] = useState(false);
  const site = usePublic<SiteData>('/public/site').data;
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b-4 border-gold-400 bg-brand-500 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Link to="/" className="font-display text-xl font-bold leading-tight sm:text-2xl">Kingdom of Knowledge</Link>
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="public-nav" className="whitespace-nowrap rounded-md border border-white/60 px-3 py-1.5 text-sm font-medium lg:hidden">{open ? 'Close' : 'Menu'}</button>
          <nav id="public-nav" aria-label="Main" className={`${open ? 'flex' : 'hidden'} absolute left-0 right-0 top-[3.6rem] z-20 flex-col gap-1 bg-brand-700 p-3 lg:static lg:flex lg:flex-row lg:items-center lg:bg-transparent lg:p-0`}>
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setOpen(false)}
                className={({ isActive }) => `rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-gold-400 text-brand-900' : 'hover:bg-white/10'}`}>{n.label}</NavLink>
            ))}
            <Link to="/login" onClick={() => setOpen(false)} className="rounded-md bg-gold-400 px-4 py-2 text-center text-sm font-semibold text-brand-900 hover:bg-gold-500 lg:ml-2">Sign in</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1"><Outlet /></main>
      <footer className="bg-brand-900 text-brand-100">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-8 text-sm sm:grid-cols-3">
          <div><p className="font-display text-lg font-bold text-white">Kingdom of Knowledge</p><address className="mt-2 not-italic">13, Sunmonu Street, Mafoluku, Oshodi, Lagos, Nigeria</address></div>
          <div>
            <p className="font-semibold text-white">Get in touch</p>
            <ul className="mt-2 space-y-1">
              {site?.contact.phone && <li>Phone: {site.contact.phone}</li>}
              {site?.contact.email && <li>Email: {site.contact.email}</li>}
              {site?.contact.officeHours && <li>{site.contact.officeHours}</li>}
              <li><Link className="underline" to="/contact">Contact page and map</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-white">Quick links</p>
            <ul className="mt-2 space-y-1"><li><Link className="underline" to="/admissions/apply">Apply for admission</Link></li><li><Link className="underline" to="/admissions/status">Check an application</Link></li><li><Link className="underline" to="/privacy">Privacy notice</Link></li><li><Link className="underline" to="/login">Student, teacher and parent sign in</Link></li></ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
