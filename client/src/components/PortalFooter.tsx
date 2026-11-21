import PoweredBy from './PoweredBy';

// A slim footer for the signed-in areas and the sign-in pages.
export default function PortalFooter() {
  return (
    <footer className="no-print mt-10 border-t border-line py-4 text-center">
      <PoweredBy />
    </footer>
  );
}
