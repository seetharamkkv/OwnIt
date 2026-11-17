/*
 * Picks the editor that matches the assignment's file kind. Owner: Keya.
 */
import React from 'react';

import { DocEditor } from './DocEditor';
import { NotebookEditor } from './NotebookEditor';
import { PyEditor } from './PyEditor';
import type { StepEditorProps } from './types';

export function StepEditor(props: StepEditorProps) {
  switch (props.fileKind) {
    case 'IPYNB':
      return <NotebookEditor {...props} />;
    case 'DOCX':
      return <DocEditor {...props} />;
    default:
      return <PyEditor {...props} />;
  }
}
