/*
 * Full-page message for errors, no-access, and not-found states. Owner: Shreya.
 */
import React from 'react';

interface PageMessageProps {
  title: string;
  message?: string;
}

export function PageMessage({ title, message }: PageMessageProps) {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <div className="flex max-w-[560px] flex-col gap-2">
        <h1 className="text-c3-bold-heading-h5 text-[var(--c3-style-basic-fg-primary)]">{title}</h1>
        {message ? <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">{message}</p> : null}
      </div>
    </div>
  );
}
