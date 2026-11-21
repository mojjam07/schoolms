# Logo and "Powered by CyberSpark IT Solutions" footer

## Copy over the project (same paths)
- `client/public/logo.svg`, `client/public/logo.png`, `client/public/favicon.svg`: **placeholder** logo in the school's brand colours (green #438F17, gold #EED13F): an open book with a crown. Replace the files with the school's real logo, keeping the names, and every page updates with no code change.
- `client/src/components/Logo.tsx`, `PoweredBy.tsx`, `PortalFooter.tsx`
- `server/assets/logo.png`: the logo used on PDF receipts and statements (PNG or JPG; the PDF library cannot draw SVG). Replace it the same way, or point `SCHOOL_LOGO_PATH` at another file.
- `server/src/modules/pdf/pdf.service.ts`: replaces the Phase 18 copy. It draws the logo in the header and uses the school green instead of blue.

## Then make the edits in `WIRING_CLIENT.txt`
The footer line is "Powered by **CyberSpark IT Solutions**", linked to https://www.cybersparkit.site. It opens in a new tab, has `rel="noopener noreferrer"`, and says "(opens in a new tab)" to screen readers.
It goes on the public website, inside every signed-in area and on the sign-in pages. It is not printed on report cards or receipts on screen-print (the portal footer is hidden when printing).

## Notes
- The placeholder logo is mine, not the school's. REMAINING-WORK Section 4 still lists "a logo" as something the school must provide.
- If your Content-Security-Policy is strict, nothing changes: the logo and favicon are files on your own site. The credit link is a normal link, not a loaded resource.
- Not done: I have not seen `PublicLayout.tsx`, `PortalLayout.tsx` or the sign-in pages, so I could not make those edits for you. Send them and I will return them ready to copy. The PDFs do not carry the "Powered by" line (they are the school's official documents); say so if you want it added.
- `Logo.tsx` falls back to a green "KK" badge if the image fails to load.
