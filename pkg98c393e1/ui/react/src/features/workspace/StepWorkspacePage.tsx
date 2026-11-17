/*
 * Routes /assignment/:assignmentId (student) and /assignment/:assignmentId/preview (staff). Owner: Keya.
 */
import React from 'react';
import { useParams } from 'react-router-dom';

import { StepWorkspace } from './StepWorkspace';

export default function StepWorkspacePage({ mode }: { mode: 'student' | 'preview' }) {
  const { assignmentId = '' } = useParams();
  return <StepWorkspace assignmentId={assignmentId} mode={mode} />;
}
