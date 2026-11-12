import { useState } from 'react';
import { SmallButton } from './ui';
import { downloadFromApi } from '../lib/api';

// Downloads a PDF from the API using the signed-in token. Shows its own error text if the download fails.
export default function DownloadPdfButton({ path, filename, label }: { path: string; filename: string; label: string }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async () => {
    setBusy(true); setErr('');
    try { await downloadFromApi(path, filename); } catch (e) { setErr(e instanceof Error ? e.message : 'The download failed. Please try again.'); }
    finally { setBusy(false); }
  };
  return (
    <>
      <SmallButton onClick={go} disabled={busy}>{busy ? 'Preparing…' : label}</SmallButton>
      {err && <span role="alert" className="ml-2 text-sm text-red-700">{err}</span>}
    </>
  );
}
