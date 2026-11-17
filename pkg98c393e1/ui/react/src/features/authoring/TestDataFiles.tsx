/*
 * Test data files for an assignment (e.g. data/sales.csv), shown in the builder. Owner: Rohith.
 */
import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { Input } from '@/components/ui/input';
import { InputFile } from '@/components/ui/input-file';
import { Label } from '@/components/ui/label';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';

import type { EduAttachment } from '@/common/eduTypes';
import { eduErrorMessage } from '@/common/errors';
import { queryKeys } from '@/common/queryKeys';

import { fileToBase64, removeTestData, uploadTestData } from './api';

const MAX_BYTES = 5 * 1024 * 1024;

function formatSize(bytes?: number): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface TestDataFilesProps {
  assignmentId: string;
  files: EduAttachment[];
}

export function TestDataFiles({ assignmentId, files }: TestDataFilesProps) {
  const queryClient = useQueryClient();
  const { reportError } = useErrorBoundary();
  const [picked, setPicked] = useState<File | null>(null);
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.assignment(assignmentId) });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setPicked(file);
    setError(null);
    if (file) {
      setPath(`data/${file.name.replace(/[^A-Za-z0-9._-]+/g, '_')}`);
    }
  };

  const upload = async () => {
    if (!picked) return;
    if (picked.size > MAX_BYTES) {
      setError(`${picked.name} is larger than 5 MB.`);
      return;
    }
    setBusy('upload');
    setError(null);
    try {
      await uploadTestData(assignmentId, path, await fileToBase64(picked));
      setPicked(null);
      setPath('');
      await refresh();
    } catch (err) {
      setError(eduErrorMessage(err));
      reportError(err);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (fileName: string) => {
    setBusy(fileName);
    setError(null);
    try {
      await removeTestData(assignmentId, fileName);
      await refresh();
    } catch (err) {
      setError(eduErrorMessage(err));
      reportError(err);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Container title="Test data files" subtitle="Files the tests and student code can open, e.g. pd.read_csv('data/sales.csv')">
      <div className="flex flex-col gap-3">
        {files.length === 0 ? (
          <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">No files yet.</p>
        ) : (
          <ul className="flex flex-col">
            {files.map((f) => (
              <li key={f.fileName} className="flex items-center justify-between gap-2 border-b border-[var(--c3-style-basic-border-border)] py-1">
                <span className="text-c3-regular-body-p2 font-mono text-[var(--c3-style-basic-fg-primary)]">{f.fileName}</span>
                <div className="flex items-center gap-2">
                  <span className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">{formatSize(f.sizeBytes)}</span>
                  <Button
                    variant="ghost"
                    appearance="danger"
                    size="icon-sm"
                    aria-label={`Remove ${f.fileName}`}
                    loading={busy === f.fileName}
                    onClick={() => remove(f.fileName)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="grid items-end gap-2 sm:grid-cols-[auto_1fr_auto]">
          <InputFile buttonLabel="Choose file" onChange={onPick} />
          <div className="flex flex-col gap-1">
            <Label htmlFor={`testdata-path-${assignmentId}`}>Path in the test runner</Label>
            <Input id={`testdata-path-${assignmentId}`} value={path} onChange={(e) => setPath(e.target.value)} placeholder="data/sales.csv" disabled={!picked} />
          </div>
          <Button variant="outline" appearance="secondary" disabled={!picked || !path.trim()} loading={busy === 'upload'} onClick={upload}>
            Upload
          </Button>
        </div>
        {error ? <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-danger)]">{error}</p> : null}
      </div>
    </Container>
  );
}
