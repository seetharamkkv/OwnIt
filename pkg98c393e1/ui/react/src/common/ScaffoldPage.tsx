/*
 * Placeholder for pages that are not built yet. Owner: Shreya.
 * Replace a page's <ScaffoldPage> with the real content when you build it; delete this file once nothing uses it.
 */
import React from 'react';

import { Badge } from '@/components/ui/badge';
import { Container } from '@/components/ui/container';

interface ScaffoldPageProps {
  title: string;
  /** Team member who builds this page, e.g. "Keya — Student workspace". */
  owner: string;
  /** PROJECT_PLAN.md section that describes the page. */
  planSection: string;
  /** What the finished page does, one bullet per item. */
  todo: string[];
  children?: React.ReactNode;
}

export function ScaffoldPage({ title, owner, planSection, todo, children }: ScaffoldPageProps) {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">{title}</h1>
        <Badge variant="outline" appearance="warning">
          Not built yet
        </Badge>
      </div>
      <Container title={`Owner: ${owner}`} subtitle={`See PROJECT_PLAN.md ${planSection}`}>
        <ul className="text-c3-regular-body-p2 list-disc pl-5 text-[var(--c3-style-basic-fg-secondary)]">
          {todo.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Container>
      {children}
    </div>
  );
}
