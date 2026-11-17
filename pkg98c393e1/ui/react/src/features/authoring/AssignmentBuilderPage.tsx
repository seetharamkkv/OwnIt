/*
 * Assignment builder (/course/:courseId/assignments/new and /:assignmentId/edit). Owner: Rohith. PROJECT_PLAN.md 4.3.
 * New: details + template → live step preview → Save draft (creates the assignment and imports its steps).
 * Edit: same, plus per-step title/points/instructions, tests (Shreenidhi's TestEditor), publish, preview, submissions.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Download, Eye, Save, Send } from 'lucide-react';

import { Alert, AlertAppearanceIcon, AlertContent, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { InputFile } from '@/components/ui/input-file';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useErrorBoundary } from '@/components/ErrorBoundary/ErrorBoundary';

import { useCourseRole, useMe } from '@/common/auth/useMe';
import type { EduAssignment, FileKind, TemplateParseResult } from '@/common/eduTypes';
import { eduErrorMessage } from '@/common/errors';
import { PageMessage } from '@/common/PageMessage';
import { queryKeys } from '@/common/queryKeys';
import { routes } from '@/common/routes';

import {
  countSubmissions,
  createAssignment,
  fetchAssignment,
  fetchAssignmentSteps,
  importTemplate,
  parseTemplate,
  fileToBase64,
  previewTemplate,
  updateAssignment,
} from './api';
import { AssignmentSubmissions } from './AssignmentSubmissions';
import { FILE_KIND_LABEL, fileKindFromName, fromLocalInput, toLocalInput } from './format';
import { MarkdownField } from './MarkdownField';
import { StepEditorCard } from './StepEditorCard';
import { TestDataFiles } from './TestDataFiles';

const TEMPLATE_HINT: Record<FileKind, string> = {
  PY: 'Mark each student part with  # <<STEP id="..." title="..." points="2">>  …  # <<END STEP>>',
  IPYNB: 'Tag a code cell with metadata {"edu": {"step": "id"}}, or start it with  # <<STEP id="...">>',
  DOCX: 'Add a paragraph  {{STEP id="..." title="..." points="2" instructions="..."}}  where students answer, and  {{END STEP}}  after it',
};

interface FormState {
  title: string;
  descriptionMd: string;
  fileKind: FileKind;
  releaseAt: string;
  dueAt: string;
  lateUntil: string;
  latePenaltyPct: string;
}

const EMPTY_FORM: FormState = {
  title: '',
  descriptionMd: '',
  fileKind: 'PY',
  releaseAt: '',
  dueAt: '',
  lateUntil: '',
  latePenaltyPct: '',
};

function formFrom(a: EduAssignment): FormState {
  return {
    title: a.title ?? '',
    descriptionMd: a.descriptionMd ?? '',
    fileKind: a.fileKind ?? 'PY',
    releaseAt: toLocalInput(a.releaseAt),
    dueAt: toLocalInput(a.dueAt),
    lateUntil: toLocalInput(a.lateUntil),
    latePenaltyPct: a.latePenaltyPct != null ? String(a.latePenaltyPct) : '',
  };
}

export default function AssignmentBuilderPage() {
  const { courseId = '', assignmentId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { reportError } = useErrorBoundary();
  const { me } = useMe();
  const courseRole = useCourseRole(courseId);
  const canPublish = me?.platformRole === 'ADMIN' || courseRole === 'INSTRUCTOR';

  const assignment = useQuery({
    queryKey: queryKeys.assignment(assignmentId ?? 'new'),
    queryFn: () => fetchAssignment(assignmentId as string),
    enabled: Boolean(assignmentId),
  });
  const steps = useQuery({
    queryKey: queryKeys.assignmentSteps(assignmentId ?? 'new'),
    queryFn: () => fetchAssignmentSteps(assignmentId as string),
    enabled: Boolean(assignmentId),
  });

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [template, setTemplate] = useState('');
  const [templateDirty, setTemplateDirty] = useState(false);
  const [preview, setPreview] = useState<TemplateParseResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [templateName, setTemplateName] = useState<string | null>(null);

  const submissionCount = useQuery({
    queryKey: ['edu', 'authoring', 'submissionCount', assignmentId],
    queryFn: () => countSubmissions(assignmentId as string),
    enabled: Boolean(assignmentId),
  });

  // Load an existing assignment into the form once.
  useEffect(() => {
    if (assignment.data) {
      setForm(formFrom(assignment.data));
      setTemplate(assignment.data.templateContent ?? '');
      setTemplateDirty(false);
    }
  }, [assignment.data]);

  // Live step preview, 600 ms after the template stops changing.
  useEffect(() => {
    if (!template.trim()) {
      setPreview(null);
      setPreviewError(null);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      parseTemplate(form.fileKind, template)
        .then((res) => {
          if (!cancelled) {
            setPreview(res);
            setPreviewError(null);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setPreview(null);
            setPreviewError(eduErrorMessage(err));
          }
        });
    }, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [template, form.fileKind]);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const kind = fileKindFromName(file.name);
    if (!kind) {
      setPreviewError('Upload a .py, .ipynb, or .docx file.');
      return;
    }
    if (assignmentId && kind !== form.fileKind) {
      setPreviewError(`This assignment is a ${FILE_KIND_LABEL[form.fileKind]} assignment; upload the same kind of file.`);
      return;
    }
    setForm((f) => ({ ...f, fileKind: kind, title: f.title || file.name.replace(/\.(py|ipynb|docx)$/i, '') }));
    try {
      setTemplate(kind === 'DOCX' ? await fileToBase64(file) : await file.text());
      setTemplateName(file.name);
      setTemplateDirty(true);
    } catch (err) {
      reportError(err);
    }
  };

  const steppedCount = preview?.steps?.length ?? 0;
  const reimportRisk = Boolean(assignmentId && templateDirty && (submissionCount.data ?? 0) > 0);
  const canSave = form.title.trim().length > 0 && (assignmentId ? true : template.trim().length > 0) && !saving;

  const fields = useMemo(
    () => ({
      title: form.title.trim(),
      descriptionMd: form.descriptionMd,
      fileKind: form.fileKind,
      releaseAt: fromLocalInput(form.releaseAt),
      dueAt: fromLocalInput(form.dueAt),
      lateUntil: fromLocalInput(form.lateUntil),
      latePenaltyPct: form.latePenaltyPct ? Number(form.latePenaltyPct) : undefined,
    }),
    [form]
  );

  const refresh = async (id: string) => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.assignment(id) });
    await queryClient.invalidateQueries({ queryKey: queryKeys.assignmentSteps(id) });
  };

  const save = async (status?: 'DRAFT' | 'PUBLISHED') => {
    setSaving(true);
    setSaveError(null);
    try {
      let id = assignmentId;
      if (!id) {
        const created = await createAssignment({ ...fields, course: { id: courseId }, status: 'DRAFT' });
        id = created.id;
      } else {
        await updateAssignment({ id, ...fields, ...(status ? { status } : {}) });
      }
      if (!assignmentId || templateDirty) {
        const res = await importTemplate(id, template);
        setImportWarnings(res.warnings ?? []);
        setTemplateDirty(false);
      }
      if (!assignmentId) {
        navigate(routes.assignmentEdit(courseId, id), { replace: true });
      } else {
        await refresh(id);
      }
    } catch (err) {
      setSaveError(eduErrorMessage(err));
      reportError(err);
    } finally {
      setSaving(false);
    }
  };

  const downloadPreview = async () => {
    if (!assignmentId) return;
    try {
      window.open(await previewTemplate(assignmentId), '_blank', 'noopener');
    } catch (err) {
      setSaveError(eduErrorMessage(err));
      reportError(err);
    }
  };

  if (assignmentId && assignment.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }
  if (assignmentId && assignment.error) {
    return <PageMessage title="Could not load the assignment" message={eduErrorMessage(assignment.error)} />;
  }
  if (assignmentId && !assignment.data) {
    return <PageMessage title="Assignment not found" />;
  }

  const status = assignment.data?.status ?? 'DRAFT';

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">
            {assignmentId ? form.title || 'Edit assignment' : 'New assignment'}
          </h1>
          {assignmentId ? (
            <Badge variant="soft" appearance={status === 'PUBLISHED' ? 'success' : 'secondary'}>
              {status}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" appearance="secondary" onClick={() => navigate(routes.course(courseId))}>
            Back to course
          </Button>
          {assignmentId ? (
            <>
              <Button variant="outline" appearance="secondary" leadingIcon={<Eye />} onClick={() => navigate(routes.workspacePreview(assignmentId))}>
                Preview as student
              </Button>
              <Button variant="outline" appearance="secondary" leadingIcon={<Download />} onClick={downloadPreview}>
                Download template
              </Button>
            </>
          ) : null}
          <Button variant="outline" appearance="secondary" leadingIcon={<Save />} disabled={!canSave} loading={saving} onClick={() => save()}>
            {!assignmentId ? 'Save draft' : reimportRisk ? 'Save and re-import' : 'Save'}
          </Button>
          {assignmentId ? (
            <Button
              variant="solid"
              appearance="accent"
              leadingIcon={<Send />}
              disabled={!canSave || !canPublish}
              title={canPublish ? undefined : 'Only instructors can publish or unpublish'}
              onClick={() => save(status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED')}
            >
              {status === 'PUBLISHED' ? 'Unpublish' : 'Publish'}
            </Button>
          ) : null}
        </div>
      </div>

      {reimportRisk ? (
        <Alert variant="soft" appearance="warning">
          <AlertAppearanceIcon appearance="warning" />
          <AlertContent>
            <AlertTitle>{`${submissionCount.data} student${submissionCount.data === 1 ? ' has' : 's have'} started this assignment`}</AlertTitle>
            <AlertDescription>
              Saving re-imports the template. Steps whose id is unchanged keep their answers and tests. Steps you removed are
              kept if anyone answered them; renamed ids count as a new step.
            </AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}
      {!canPublish && assignmentId ? (
        <Alert variant="soft" appearance="info">
          <AlertAppearanceIcon appearance="info" />
          <AlertContent>
            <AlertTitle>TAs can edit drafts; an instructor publishes.</AlertTitle>
          </AlertContent>
        </Alert>
      ) : null}
      {saveError ? (
        <Alert variant="soft" appearance="destructive">
          <AlertAppearanceIcon appearance="destructive" />
          <AlertContent>
            <AlertTitle>Could not save</AlertTitle>
            <AlertDescription>{saveError}</AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}
      {importWarnings.length ? (
        <Alert variant="soft" appearance="warning">
          <AlertAppearanceIcon appearance="warning" />
          <AlertContent>
            <AlertTitle>Template imported with warnings</AlertTitle>
            <AlertDescription>{importWarnings.join(' · ')}</AlertDescription>
          </AlertContent>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Container title="Details">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="asg-title">Title</Label>
              <Input id="asg-title" value={form.title} onChange={set('title')} placeholder="HW1: Exploring sales data" />
            </div>
            <MarkdownField
              id="asg-desc"
              label="Description (Markdown)"
              value={form.descriptionMd}
              onChange={(v) => setForm((f) => ({ ...f, descriptionMd: v }))}
              rows={3}
            />
            <div className="flex flex-col gap-1">
              <span className="text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-primary)]">File type</span>
              <Tabs
                variant="boxed"
                value={form.fileKind}
                onValueChange={(v) => {
                  setForm((f) => ({ ...f, fileKind: v as FileKind }));
                  setTemplateDirty(true);
                }}
              >
                <TabsList>
                  {(['PY', 'IPYNB', 'DOCX'] as FileKind[]).map((k) => (
                    <TabsTrigger key={k} value={k} disabled={Boolean(assignmentId)}>
                      {FILE_KIND_LABEL[k]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="asg-release">Release</Label>
                <Input id="asg-release" type="datetime-local" value={form.releaseAt} onChange={set('releaseAt')} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="asg-due">Due</Label>
                <Input id="asg-due" type="datetime-local" value={form.dueAt} onChange={set('dueAt')} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="asg-late">Accept late work until</Label>
                <Input id="asg-late" type="datetime-local" value={form.lateUntil} onChange={set('lateUntil')} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="asg-penalty">Late penalty (%)</Label>
                <Input id="asg-penalty" type="number" min={0} max={100} value={form.latePenaltyPct} onChange={set('latePenaltyPct')} />
              </div>
            </div>
          </div>
        </Container>

        <Container title="Template" subtitle={TEMPLATE_HINT[form.fileKind]}>
          <div className="flex flex-col gap-3">
            <InputFile
              accept={form.fileKind === 'DOCX' ? '.docx' : assignmentId ? (form.fileKind === 'PY' ? '.py' : '.ipynb') : '.py,.ipynb,.docx'}
              buttonLabel="Upload template"
              onChange={onFile}
            />
            {form.fileKind === 'DOCX' ? (
              <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
                {templateName
                  ? `${templateName} loaded (${Math.round((template.length * 3) / 4 / 1024)} KB).`
                  : template
                    ? 'A Word template is stored. Upload a new one to replace it.'
                    : 'Upload a .docx file. Word templates are edited in Word, not here.'}
              </p>
            ) : (
              <Textarea
                aria-label="Template source"
                value={template}
                onChange={(e) => {
                  setTemplate(e.target.value);
                  setTemplateDirty(true);
                }}
                rows={14}
                spellCheck={false}
                className="font-mono"
              />
            )}
            {assignmentId && templateDirty ? (
              <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                Template changed: Save re-imports the steps. Tests and answers stay attached to steps whose id is unchanged.
              </p>
            ) : null}
          </div>
        </Container>
      </div>

      <Container
        title="Step preview"
        subtitle={previewError ? 'Template has errors' : preview ? `${steppedCount} step${steppedCount === 1 ? '' : 's'} found` : 'Add a template to see its steps'}
      >
        {previewError ? (
          <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-danger)]">{previewError}</p>
        ) : null}
        {preview?.warnings?.length ? (
          <ul className="text-c3-regular-body-p3 mb-2 list-disc pl-5 text-[var(--c3-style-basic-fg-warning)]">
            {preview.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
        {preview?.steps?.length ? (
          <ol className="flex flex-col gap-1">
            {preview.steps.map((s) => (
              <li key={s.markerId} className="text-c3-regular-body-p2 flex flex-wrap items-center gap-2 text-[var(--c3-style-basic-fg-primary)]">
                <span className="text-c3-bold-body-p2">
                  {s.stepOrder}. {s.title}
                </span>
                <Badge variant="outline" appearance="secondary">
                  {s.markerId}
                </Badge>
                {s.points != null ? (
                  <Badge variant="soft" appearance="info">
                    {s.points} pts
                  </Badge>
                ) : null}
              </li>
            ))}
          </ol>
        ) : null}
      </Container>

      {assignmentId ? (
        <>
          <h2 className="text-c3-bold-heading-h5 text-[var(--c3-style-basic-fg-primary)]">Steps</h2>
          {steps.isLoading ? <Spinner /> : null}
          {steps.error ? (
            <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-danger)]">{eduErrorMessage(steps.error)}</p>
          ) : null}
          {(steps.data ?? []).map((s) => (
            <StepEditorCard key={s.id} step={s} fileKind={form.fileKind} onSaved={() => refresh(assignmentId)} />
          ))}
          {form.fileKind !== 'DOCX' ? (
            <TestDataFiles assignmentId={assignmentId} files={assignment.data?.testDataFiles ?? []} />
          ) : null}
          <AssignmentSubmissions courseId={courseId} assignmentId={assignmentId} dueAt={assignment.data?.dueAt} />
        </>
      ) : null}
    </div>
  );
}
