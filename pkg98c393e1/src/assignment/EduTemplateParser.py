"""
EduTemplateParser — reads step markers from templates. Owner: Rohith (assignment engine).

PY marker format (PROJECT_PLAN.md section 4.1):

    # <<STEP id="load" title="Load the CSV" points="2">>
    # Comment lines right after the marker become the step instructions.
    pass
    # <<END STEP>>

IPYNB: a code cell is a step when its metadata has {"edu": {"step": "<id>", "title": ..., "points": ...}}, or when its
first line is a STEP marker (the END marker is optional inside a cell).

DOCX: a paragraph that reads {{STEP id="intro" title="..." points="2" instructions="..."}} starts a step and
{{END STEP}} ends it (optional: without it the step starts empty). Paragraphs in between are the starter content.
Content is base64 of the .docx file; starter content and context are HTML (see _docx_to_html for the tags).

Each step's contextBefore is the template text between the previous step and this one; the last step's contextAfter
is the rest of the file. Other steps' contextAfter is the next step's contextBefore (display only).
"""

import json
import re

_START = re.compile(r'^\s*#\s*<<\s*STEP\b(?P<attrs>[^>]*)>>\s*$')
_END = re.compile(r'^\s*#\s*<<\s*END\s+STEP\s*>>\s*$')
_ATTR = re.compile(r'(\w+)\s*=\s*"([^"]*)"')
_SAFE_ID = re.compile(r'[^A-Za-z0-9_-]+')


def parse(cls, fileKind, content):
    if fileKind == 'PY':
        steps, warnings = _parse_py(content or '')
    elif fileKind == 'IPYNB':
        steps, warnings = _parse_ipynb(content or '')
    elif fileKind == 'DOCX':
        return c3.EduTemplateParser.doParseDocx(content or '')
    else:
        raise ValueError('EDU_VALIDATION: unknown file kind ' + str(fileKind))
    if not steps:
        warnings.append('No steps found. Mark each student part with # <<STEP id="...">> ... # <<END STEP>>.')
    return c3.EduTemplateParser.Result.make({
        'steps': [c3.EduTemplateParser.ParsedStep.make(s) for s in steps],
        'warnings': warnings,
    })


def importTemplate(cls, assignmentId, content=None, fileUrl=None):
    assignment = c3.EduAssignment.forId(assignmentId)
    if assignment is None:
        raise ValueError('EDU_NOT_FOUND: assignment ' + assignmentId)
    c3.EduEnrollment.requireCourseRole(assignment.course.id, ['INSTRUCTOR', 'TA'])

    text = content
    if not text and fileUrl:
        text = c3.File.make({'url': fileUrl}).readString()
    if not text:
        text = assignment.templateContent
    if not text:
        raise ValueError('EDU_VALIDATION: pass the template text or a file URL')

    result = parse(cls, assignment.fileKind, text)
    warnings = list(result.warnings or [])

    new_steps = []
    new_ids = set()
    for s in result.steps or []:
        step_id = assignmentId + '_' + s.markerId
        new_ids.add(step_id)
        new_steps.append(c3.EduAssignmentStep.make({
            'id': step_id,
            'assignment': {'id': assignmentId},
            'stepOrder': s.stepOrder,
            'markerId': s.markerId,
            'title': s.title or s.markerId,
            'instructionsMd': s.instructionsMd,
            'starterContent': s.starterContent,
            'contextBefore': s.contextBefore,
            'contextAfter': s.contextAfter,
            'cellIndex': s.cellIndex,
            'points': s.points,
        }))

    existing = c3.EduAssignmentStep.fetch({
        'filter': c3.Filter.eq('assignment.id', assignmentId),
        'include': 'id, markerId',
        'limit': 500,
    }).objs or []
    for old in existing:
        if old.id in new_ids:
            continue
        answered = c3.EduStepResponse.fetchCount({'filter': c3.Filter.eq('step.id', old.id)})
        if answered:
            warnings.append('Step "%s" is no longer in the template but has %d answers, so it was kept.' % (old.markerId, answered))
            continue
        tests = c3.EduStepTest.fetch({'filter': c3.Filter.eq('step.id', old.id), 'include': 'id', 'limit': 500}).objs or []
        if tests:
            c3.EduStepTest.removeBatch(list(tests))
        c3.EduAssignmentStep.make({'id': old.id}).remove()

    if new_steps:
        c3.EduAssignmentStep.upsertBatch(new_steps)
    c3.EduAssignment.make({'id': assignmentId, 'templateContent': text, 'templateFileUrl': fileUrl or assignment.templateFileUrl}).merge()
    c3.log().info('Imported {} steps into assignment {}', len(new_steps), assignmentId)

    return c3.EduTemplateParser.Result.make({'steps': list(result.steps or []), 'warnings': warnings})


def _attrs(raw):
    return {k: v for k, v in _ATTR.findall(raw or '')}


def _points(value, warnings, where):
    if value in (None, ''):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        warnings.append('%s: points="%s" is not a number' % (where, value))
        return None


def _unique_id(raw_id, seen, warnings, where):
    marker_id = _SAFE_ID.sub('_', (raw_id or '').strip()) or 'step%d' % (len(seen) + 1)
    if not raw_id:
        warnings.append('%s: step has no id; using "%s"' % (where, marker_id))
    elif marker_id != raw_id:
        warnings.append('%s: id "%s" changed to "%s" (letters, digits, _ and - only)' % (where, raw_id, marker_id))
    base, n = marker_id, 2
    while marker_id in seen:
        marker_id = '%s_%d' % (base, n)
        n += 1
    if marker_id != base:
        warnings.append('%s: duplicate id "%s"; renamed to "%s"' % (where, base, marker_id))
    seen.add(marker_id)
    return marker_id


def _split_instructions(lines):
    """Leading comment lines become Markdown instructions; the rest is starter content."""
    instructions = []
    i = 0
    while i < len(lines) and lines[i].strip().startswith('#'):
        text = lines[i].strip()[1:]
        instructions.append(text[1:] if text.startswith(' ') else text)
        i += 1
    return '\n'.join(instructions).strip(), ''.join(lines[i:])


def _link_context(steps, tail):
    for i, s in enumerate(steps):
        s['contextAfter'] = steps[i + 1]['contextBefore'] if i + 1 < len(steps) else tail


def _parse_py(text):
    lines = text.splitlines(keepends=True)
    steps, warnings, seen = [], [], set()
    gap, cur = [], None

    def close(line_no):
        instructions, starter = _split_instructions(cur['body'])
        steps.append({
            'markerId': cur['markerId'],
            'title': cur['title'] or (instructions.splitlines()[0] if instructions else cur['markerId']),
            'stepOrder': len(steps) + 1,
            'instructionsMd': instructions,
            'starterContent': starter,
            'contextBefore': cur['contextBefore'],
            'points': cur['points'],
        })

    for n, line in enumerate(lines, start=1):
        bare = line.rstrip('\r\n')
        start = _START.match(bare)
        if start:
            if cur is not None:
                warnings.append('Line %d: a STEP starts inside step "%s"; closing it first (nested steps are not allowed)' % (n, cur['markerId']))
                close(n)
            attrs = _attrs(start.group('attrs'))
            where = 'Line %d' % n
            cur = {
                'markerId': _unique_id(attrs.get('id'), seen, warnings, where),
                'title': attrs.get('title'),
                'points': _points(attrs.get('points'), warnings, where),
                'contextBefore': ''.join(gap),
                'body': [],
            }
            gap = []
        elif _END.match(bare):
            if cur is None:
                warnings.append('Line %d: END STEP without a matching STEP; ignored' % n)
            else:
                close(n)
                cur = None
        elif cur is not None:
            cur['body'].append(line)
        else:
            gap.append(line)

    if cur is not None:
        warnings.append('Step "%s" is never closed with # <<END STEP>>; it runs to the end of the file' % cur['markerId'])
        close(len(lines))
    _link_context(steps, ''.join(gap))
    return steps, warnings


def _cell_source(cell):
    src = cell.get('source', '')
    return ''.join(src) if isinstance(src, list) else (src or '')


def _parse_ipynb(text):
    try:
        nb = json.loads(text)
    except ValueError as e:
        raise ValueError('EDU_VALIDATION: not a valid notebook (JSON error: %s)' % e)
    cells = nb.get('cells')
    if not isinstance(cells, list):
        raise ValueError('EDU_VALIDATION: not a valid notebook (no "cells" list)')

    steps, warnings, seen, gap = [], [], set(), []
    for idx, cell in enumerate(cells):
        src = _cell_source(cell)
        meta = (cell.get('metadata') or {}).get('edu') or {}
        where = 'Cell %d' % (idx + 1)
        raw_id, title, points, body = meta.get('step'), meta.get('title'), meta.get('points'), src

        if not raw_id and cell.get('cell_type') == 'code':
            lines = src.splitlines(keepends=True)
            first = lines[0].rstrip('\r\n') if lines else ''
            start = _START.match(first)
            if start:
                attrs = _attrs(start.group('attrs'))
                raw_id = attrs.get('id') or ''
                title = title or attrs.get('title')
                points = points if points is not None else attrs.get('points')
                rest = [l for l in lines[1:] if not _END.match(l.rstrip('\r\n'))]
                body = ''.join(rest)
                if not raw_id:
                    raw_id = None
                    warnings.append('%s: STEP marker has no id' % where)
                    raw_id = 'step%d' % (len(seen) + 1)

        if raw_id:
            if cell.get('cell_type') != 'code':
                warnings.append('%s: only code cells can be steps; skipped' % where)
                gap.append(src)
                continue
            instructions, starter = _split_instructions(body.splitlines(keepends=True))
            marker_id = _unique_id(str(raw_id), seen, warnings, where)
            steps.append({
                'markerId': marker_id,
                'title': title or (instructions.splitlines()[0] if instructions else marker_id),
                'stepOrder': len(steps) + 1,
                'instructionsMd': instructions,
                'starterContent': starter,
                'contextBefore': '\n\n'.join(gap),
                'cellIndex': idx,
                'points': _points(points, warnings, where),
            })
            gap = []
        else:
            gap.append(src)

    _link_context(steps, '\n\n'.join(gap))
    return steps, warnings


# ---- DOCX (runs in py-edu_312) ---------------------------------------------------------------------------------------

_DOCX_START = re.compile(r'^\{\{\s*STEP\b(?P<attrs>.*?)\}\}$')
_DOCX_END = re.compile(r'^\{\{\s*END\s+STEP\s*\}\}$')
_SMART_QUOTES = {'\u201c': '"', '\u201d': '"', '\u201e': '"', '\u2033': '"', '\u2018': "'", '\u2019': "'"}
_MONO_FONTS = ('courier', 'consolas', 'menlo', 'monaco', 'mono')


def doParseDocx(cls, contentBase64):
    import base64
    import binascii
    try:
        data = base64.b64decode(contentBase64 or '', validate=True)
    except (binascii.Error, ValueError):
        raise ValueError('EDU_VALIDATION: DOCX content must be the base64-encoded file')
    steps, warnings = _parse_docx_bytes(data)
    if not steps:
        warnings.append('No steps found. Add a paragraph {{STEP id="..."}} where the student answers, and {{END STEP}} after it.')
    return c3.EduTemplateParser.Result.make({
        'steps': [c3.EduTemplateParser.ParsedStep.make(s) for s in steps],
        'warnings': warnings,
    })


def _marker_text(paragraph):
    text = paragraph.text.strip()
    for k, v in _SMART_QUOTES.items():
        text = text.replace(k, v)
    return text


def _docx_blocks(doc):
    """Body-level paragraphs and tables in document order."""
    from docx.table import Table
    from docx.text.paragraph import Paragraph
    for child in doc.element.body.iterchildren():
        tag = child.tag.rsplit('}', 1)[-1]
        if tag == 'p':
            yield Paragraph(child, doc)
        elif tag == 'tbl':
            yield Table(child, doc)


def _parse_docx_bytes(data):
    """
    {{STEP ...}} opens a step; {{END STEP}} closes it and its paragraphs become the starter content.
    A step with no END marker starts empty: the paragraphs after it are context, up to the next STEP.
    """
    import io
    from docx import Document
    from docx.text.paragraph import Paragraph
    try:
        doc = Document(io.BytesIO(data))
    except Exception as e:  # python-docx raises several exception types for corrupt files
        raise ValueError('EDU_VALIDATION: not a valid .docx file (%s)' % e)

    steps, warnings, seen = [], [], set()
    gap, cur = [], None

    def close(step, body):
        steps.append({
            'markerId': step['markerId'],
            'title': step['title'] or step['markerId'],
            'stepOrder': len(steps) + 1,
            'instructionsMd': step['instructions'] or '',
            'starterContent': _docx_to_html(body),
            'contextBefore': step['contextBefore'],
            'points': step['points'],
        })

    for n, block in enumerate(_docx_blocks(doc), start=1):
        if isinstance(block, Paragraph):
            text = _marker_text(block)
            start = _DOCX_START.match(text)
            if start:
                if cur is not None:  # previous step had no END: it starts empty, its paragraphs are context
                    close(cur, [])
                    gap = cur['body']
                where = 'Paragraph %d' % n
                attrs = _attrs(start.group('attrs'))
                cur = {
                    'markerId': _unique_id(attrs.get('id'), seen, warnings, where),
                    'title': attrs.get('title'),
                    'instructions': attrs.get('instructions'),
                    'points': _points(attrs.get('points'), warnings, where),
                    'contextBefore': _docx_to_html(gap),
                    'body': [],
                }
                gap = []
                continue
            if _DOCX_END.match(text):
                if cur is None:
                    warnings.append('Paragraph %d: END STEP without a matching STEP; ignored' % n)
                else:
                    close(cur, cur['body'])
                    cur = None
                continue
        if cur is not None:
            cur['body'].append(block)
        else:
            gap.append(block)

    if cur is not None:
        close(cur, [])
        gap = cur['body']
    _link_context(steps, _docx_to_html(gap))
    return steps, warnings


def _esc(text):
    import html
    return html.escape(text, quote=False).replace('\n', '<br>')


def _run_html(run):
    text = run.text
    if not text:
        return ''
    out = _esc(text)
    font = (run.font.name or '').lower()
    if any(m in font for m in _MONO_FONTS):
        out = '<code>%s</code>' % out
    if run.underline:
        out = '<u>%s</u>' % out
    if run.italic:
        out = '<em>%s</em>' % out
    if run.bold:
        out = '<strong>%s</strong>' % out
    return out


def _para_kind(p):
    name = (p.style.name if p.style is not None else '') or ''
    lower = name.lower()
    if lower == 'title':
        return ('h', 1)
    if lower.startswith('heading'):
        digits = ''.join(ch for ch in name if ch.isdigit())
        return ('h', min(int(digits or 1), 6))
    if lower.startswith('list number'):
        return ('ol', 0)
    if lower.startswith('list') or 'bullet' in lower:
        return ('ul', 0)
    if p._p.pPr is not None and p._p.pPr.numPr is not None:
        return ('ul', 0)
    if lower in ('code', 'html preformatted', 'preformatted text', 'macro text'):
        return ('pre', 0)
    runs = [r for r in p.runs if r.text.strip()]
    if runs and all(any(m in (r.font.name or '').lower() for m in _MONO_FONTS) for r in runs):
        return ('pre', 0)
    return ('p', 0)


def _docx_to_html(blocks):
    """Paragraphs and tables → HTML using p, h1-h6, strong, em, u, code, pre, ul/ol/li, table/tr/td, br."""
    from docx.text.paragraph import Paragraph
    parts, list_kind = [], None

    def end_list():
        nonlocal list_kind
        if list_kind:
            parts.append('</%s>' % list_kind)
            list_kind = None

    for block in blocks:
        if not isinstance(block, Paragraph):
            end_list()
            rows = []
            for row in block.rows:
                cells = ''.join('<td>%s</td>' % '<br>'.join(_esc(par.text) for par in cell.paragraphs) for cell in row.cells)
                rows.append('<tr>%s</tr>' % cells)
            parts.append('<table>%s</table>' % ''.join(rows))
            continue
        kind, level = _para_kind(block)
        if kind == 'pre':
            end_list()
            parts.append('<pre><code>%s</code></pre>' % _esc(block.text))
            continue
        inner = ''.join(_run_html(r) for r in block.runs)
        if not inner.strip():
            end_list()
            continue
        if kind in ('ul', 'ol'):
            if list_kind != kind:
                end_list()
                parts.append('<%s>' % kind)
                list_kind = kind
            parts.append('<li>%s</li>' % inner)
            continue
        end_list()
        parts.append('<h%d>%s</h%d>' % (level, inner, level) if kind == 'h' else '<p>%s</p>' % inner)
    end_list()
    return ''.join(parts)
