import { useState } from 'react';
import { downloadFile } from '../lib/api';
import { fileSize } from '../lib/format';
import { messageOf } from '../lib/forms';
import type { FileInfo } from '../lib/types';
import { Alert, SmallButton } from './ui';

export function FileList({ files }: { files: FileInfo[] }) {
  const [error, setError] = useState('');
  if (!files.length) return null;
  return (
    <>
      <ul className="space-y-2">
        {files.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
            <span className="min-w-0 truncate">{f.name} <span className="text-muted">({fileSize(f.sizeBytes)})</span></span>
            <SmallButton onClick={async () => { setError(''); try { await downloadFile(f.id, f.name); } catch (e) { setError(messageOf(e)); } }}>Download</SmallButton>
          </li>
        ))}
      </ul>
      {error && <div className="mt-2"><Alert tone="error">{error}</Alert></div>}
    </>
  );
}
