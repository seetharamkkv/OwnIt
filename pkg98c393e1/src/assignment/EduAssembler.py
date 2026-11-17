"""
EduAssembler — builds final files from step answers. Owner: Rohith (assignment engine).
Output paths: edu/submissions/<submissionId>/assembled.<py|ipynb>, edu/previews/<assignmentId>/preview.<ext>.
PY files are rebuilt from the steps alone: sum of (contextBefore + answer) + last step's contextAfter.
IPYNB files replace each step cell's source in the stored template JSON.
DOCX files (py-edu_312): each {{STEP}}..{{END STEP}} region of the stored template is replaced by the answer's HTML,
converted to Word paragraphs (see _HtmlBlocks for the supported tags).
"""

import base64
import json
import re

_EXT = {'PY': 'py', 'IPYNB': 'ipynb', 'DOCX': 'docx'}
_STEP_INCLUDE = 'id, stepOrder, markerId, starterContent, contextBefore, contextAfter, cellIndex'


def assemble(cls, submissionId):
    sub, assignment = _load_submission(submissionId)
    steps = _steps(assignment.id)
    f = c3.FileSystem.makeFile('edu/submissions/%s/assembled.%s' % (submissionId, _EXT[assignment.fileKind]))
    if assignment.fileKind == 'DOCX':
        f.write(base64.b64decode(c3.EduAssembler.doBuildDocx(assignment.id, submissionId)))
    else:
        answers = _answers(submissionId)
        f.writeString(_build(assignment, steps, lambda s: answers.get(s.id, s.starterContent)))
    c3.EduSubmission.make({'id': submissionId, 'assembledFileUrl': f.url}).merge()
    c3.log().info('Assembled submission {} ({} steps)', submissionId, len(steps))
    return f.url


def assembleUpTo(cls, submissionId, stepOrder):
    sub, assignment = _load_submission(submissionId)
    steps = _steps(assignment.id)
    answers = _answers(submissionId)

    def answer(s):
        return answers.get(s.id, s.starterContent) if s.stepOrder <= stepOrder else s.starterContent

    if assignment.fileKind == 'PY':
        return _build_py(steps, answer)
    if assignment.fileKind == 'IPYNB':
        target = next((s for s in steps if s.stepOrder == stepOrder), None)
        if target is None:
            raise ValueError('EDU_NOT_FOUND: step %d' % stepOrder)
        nb = _notebook(assignment)
        by_cell = {s.cellIndex: s for s in steps}
        parts = []
        for idx, cell in enumerate(nb['cells'][: target.cellIndex + 1]):
            if cell.get('cell_type') != 'code':
                continue
            step = by_cell.get(idx)
            parts.append(answer(step) if step is not None else _source(cell))
        return '\n\n'.join(p or '' for p in parts)
    raise ValueError('EDU_VALIDATION: %s files have no runnable program' % assignment.fileKind)


def downloadLink(cls, submissionId):
    sub, assignment = _load_submission(submissionId)
    url = sub.assembledFileUrl or assemble(cls, submissionId)
    return c3.FileSystem.generatePresignedUrl(url, 'GET', '1h')


def previewTemplate(cls, assignmentId):
    assignment = c3.EduAssignment.forId(assignmentId)
    if assignment is None:
        raise ValueError('EDU_NOT_FOUND: assignment ' + assignmentId)
    c3.EduEnrollment.requireCourseRole(assignment.course.id, ['INSTRUCTOR', 'TA'])
    f = c3.FileSystem.makeFile('edu/previews/%s/preview.%s' % (assignmentId, _EXT[assignment.fileKind]))
    if assignment.fileKind == 'DOCX':
        f.write(base64.b64decode(c3.EduAssembler.doBuildDocx(assignmentId, None)))
    else:
        f.writeString(_build(assignment, _steps(assignmentId), lambda s: s.starterContent))
    return c3.FileSystem.generatePresignedUrl(f.url, 'GET', '1h')


def _load_submission(submissionId):
    sub = c3.EduSubmission.forId(submissionId)
    if sub is None:
        raise ValueError('EDU_NOT_FOUND: submission ' + submissionId)
    assignment = c3.EduAssignment.forId(sub.assignment.id)
    if sub.student.id != c3.EduSession.currentUserId():
        c3.EduEnrollment.requireCourseRole(assignment.course.id, ['INSTRUCTOR', 'TA'])
    return sub, assignment


def _steps(assignmentId):
    return list(c3.EduAssignmentStep.fetch({
        'filter': c3.Filter.eq('assignment.id', assignmentId),
        'include': _STEP_INCLUDE,
        'order': 'ascending(stepOrder)',
        'limit': 500,
    }).objs or [])


def _answers(submissionId):
    rows = c3.EduStepResponse.fetch({
        'filter': c3.Filter.eq('submission.id', submissionId),
        'include': 'step.id, content',
        'limit': 500,
    }).objs or []
    return {r.step.id: r.content for r in rows if r.content is not None}


def _build(assignment, steps, answer):
    if assignment.fileKind == 'PY':
        return _build_py(steps, answer) if steps else (assignment.templateContent or '')
    if assignment.fileKind == 'IPYNB':
        nb = _notebook(assignment)
        for s in steps:
            if s.cellIndex is None or s.cellIndex >= len(nb['cells']):
                continue
            cell = nb['cells'][s.cellIndex]
            cell['source'] = answer(s) or ''
            if cell.get('cell_type') == 'code':
                cell['outputs'] = []
                cell['execution_count'] = None
        nb.setdefault('nbformat', 4)
        nb.setdefault('nbformat_minor', 5)
        nb.setdefault('metadata', {})
        return json.dumps(nb, indent=1, ensure_ascii=False) + '\n'
    raise ValueError('EDU_VALIDATION: build DOCX files with doBuildDocx')


def _build_py(steps, answer):
    parts = []
    for s in steps:
        parts.append(s.contextBefore or '')
        text = answer(s) or ''
        parts.append(text if text.endswith('\n') or not text else text + '\n')
    if steps:
        parts.append(steps[-1].contextAfter or '')
    return ''.join(parts)


def _notebook(assignment):
    if not assignment.templateContent:
        raise ValueError('EDU_VALIDATION: assignment has no template; import one first')
    return json.loads(assignment.templateContent)


def _source(cell):
    src = cell.get('source', '')
    return ''.join(src) if isinstance(src, list) else (src or '')


# ---- DOCX (runs in py-edu_312) ---------------------------------------------------------------------------------------

_DOCX_START = re.compile(r'^\{\{\s*STEP\b(?P<attrs>.*?)\}\}$')
_DOCX_END = re.compile(r'^\{\{\s*END\s+STEP\s*\}\}$')
_ATTR = re.compile(r'(\w+)\s*=\s*"([^"]*)"')
_SAFE_ID = re.compile(r'[^A-Za-z0-9_-]+')
_SMART_QUOTES = {'\u201c': '"', '\u201d': '"', '\u201e': '"', '\u2033': '"', '\u2018': "'", '\u2019': "'"}


def doBuildDocx(cls, assignmentId, submissionId=None):
    assignment = c3.EduAssignment.forId(assignmentId)
    if not assignment.templateContent:
        raise ValueError('EDU_VALIDATION: assignment has no template; import one first')
    steps = _steps(assignmentId)
    answers = _answers(submissionId) if submissionId else {}
    by_marker = {s.markerId: answers.get(s.id, s.starterContent) or '' for s in steps}
    data = _build_docx_bytes(base64.b64decode(assignment.templateContent), by_marker)
    return base64.b64encode(data).decode('ascii')


def _build_docx_bytes(template_bytes, html_by_marker):
    """Replaces each STEP region of the template with the HTML for its marker id. Unknown markers are dropped."""
    import io
    from docx import Document
    doc = Document(io.BytesIO(template_bytes))
    body = doc.element.body
    children = list(body.iterchildren())

    # A region is what gets replaced: STEP marker .. END marker. A step without END is just its marker paragraph;
    # the paragraphs after it stay as context (same rule as EduTemplateParser._parse_docx_bytes).
    regions, cur, seen = [], None, set()
    for el in children:
        is_p = el.tag.rsplit('}', 1)[-1] == 'p'
        text = _el_text(el) if is_p else ''
        start = _DOCX_START.match(text) if is_p else None
        if start:
            if cur is not None:
                regions.append({'markerId': cur['markerId'], 'anchor': cur['anchor'], 'els': [cur['anchor']]})
            cur = {'markerId': _marker_id(start.group('attrs'), seen), 'anchor': el, 'els': [el]}
        elif is_p and _DOCX_END.match(text):
            if cur is None:
                el.getparent().remove(el)  # stray END marker: never copied into the final file
                continue
            cur['els'].append(el)
            regions.append(cur)
            cur = None
        elif cur is not None:
            cur['els'].append(el)
    if cur is not None:
        regions.append({'markerId': cur['markerId'], 'anchor': cur['anchor'], 'els': [cur['anchor']]})

    for r in regions:
        _insert_html(doc, r['anchor'], html_by_marker.get(r['markerId'], ''))
        for el in r['els']:
            el.getparent().remove(el)

    out = io.BytesIO()
    doc.save(out)
    return out.getvalue()


def _el_text(el):
    ns = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    text = ''.join(t.text or '' for t in el.iter(ns + 't')).strip()
    for k, v in _SMART_QUOTES.items():
        text = text.replace(k, v)
    return text


def _marker_id(raw_attrs, seen):
    """Same id rules as EduTemplateParser._unique_id, so region ids match the stored steps."""
    attrs = {k: v for k, v in _ATTR.findall(raw_attrs or '')}
    raw = attrs.get('id')
    marker_id = _SAFE_ID.sub('_', (raw or '').strip()) or 'step%d' % (len(seen) + 1)
    base, n = marker_id, 2
    while marker_id in seen:
        marker_id = '%s_%d' % (base, n)
        n += 1
    seen.add(marker_id)
    return marker_id


def _style(doc, name):
    try:
        return doc.styles[name]
    except KeyError:
        return None


def _add_runs(paragraph, runs):
    for text, bold, italic, underline, code in runs:
        if not text:
            continue
        pieces = text.split('\n')
        for i, piece in enumerate(pieces):
            run = paragraph.add_run(piece)
            run.bold = bold or None
            run.italic = italic or None
            run.underline = underline or None
            if code:
                run.font.name = 'Courier New'
            if i < len(pieces) - 1:
                run.add_break()


def _insert_html(doc, anchor, html_text):
    """Inserts Word paragraphs/tables for `html_text` before the `anchor` element."""
    from docx.text.paragraph import Paragraph
    parser = _HtmlBlocks()
    parser.feed(html_text or '')
    parser.close()
    anchor_par = Paragraph(anchor, doc)

    counters = {}
    for block in parser.blocks:
        kind = block['kind']
        if kind == 'table':
            rows = [r for r in block['rows'] if r]
            if not rows:
                continue
            ncols = max(len(r) for r in rows)
            table = doc.add_table(rows=len(rows), cols=ncols)
            if _style(doc, 'Table Grid') is not None:
                table.style = doc.styles['Table Grid']
            for ri, row in enumerate(rows):
                for ci, cell_runs in enumerate(row):
                    _add_runs(table.cell(ri, ci).paragraphs[0], cell_runs)
            anchor.addprevious(table._tbl)
            continue

        par = anchor_par.insert_paragraph_before()
        runs = block['runs']
        if kind == 'h':
            style = _style(doc, 'Heading %d' % block['level'])
            if style is not None:
                par.style = style
            else:
                runs = [(t, True, i, u, c) for t, b, i, u, c in runs]
        elif kind == 'li':
            list_id = block['listId']
            style = _style(doc, 'List Number' if block['ordered'] else 'List Bullet')
            if style is not None:
                par.style = style
            else:
                counters[list_id] = counters.get(list_id, 0) + 1
                prefix = '%d. ' % counters[list_id] if block['ordered'] else '\u2022 '
                runs = [(prefix, False, False, False, False)] + runs
        elif kind == 'pre':
            runs = [(t, b, i, u, True) for t, b, i, u, c in runs]
        _add_runs(par, runs)


try:
    from html.parser import HTMLParser as _HTMLParser
except ImportError:  # pragma: no cover
    _HTMLParser = object


class _HtmlBlocks(_HTMLParser):
    """
    Turns editor HTML into blocks. Supported: p, div, h1-h6, strong/b, em/i, u, code, pre, ul/ol/li, table/tr/td/th,
    br, blockquote (as p). Any other tag keeps its text only. Never executes or keeps markup, so it is safe on
    untrusted input.
    """

    BLOCK = {'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'pre', 'blockquote'}
    DROP = {'script', 'style', 'head', 'title', 'template'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []
        self.cur = None
        self.bold = self.italic = self.underline = self.code = 0
        self.pre = 0
        self.lists = []
        self.list_seq = 0
        self.table = None
        self.cell = None
        self.dropping = 0

    def _start_block(self, kind, level=0):
        self._flush()
        self.cur = {'kind': kind, 'level': level, 'runs': []}
        if kind == 'li':
            ordered, list_id = self.lists[-1] if self.lists else (False, 0)
            self.cur.update({'ordered': ordered, 'listId': list_id})

    def _flush(self):
        if self.cur is not None:
            runs = self.cur['runs']
            if runs and self.cur['kind'] != 'pre':
                text, b, i, u, c = runs[0]
                runs[0] = (text.lstrip(), b, i, u, c)
                text, b, i, u, c = runs[-1]
                runs[-1] = (text.rstrip(), b, i, u, c)
            if any(r[0].strip() for r in runs):
                self.blocks.append(self.cur)
            self.cur = None

    def handle_starttag(self, tag, attrs):
        if tag in self.DROP:
            self.dropping += 1
        elif tag in ('strong', 'b'):
            self.bold += 1
        elif tag in ('em', 'i'):
            self.italic += 1
        elif tag == 'u':
            self.underline += 1
        elif tag == 'code':
            self.code += 1
        elif tag == 'br':
            self._data('\n', raw=True)
        elif tag in ('ul', 'ol'):
            self._flush()
            self.list_seq += 1
            self.lists.append((tag == 'ol', self.list_seq))
        elif tag == 'table':
            self._flush()
            self.table = []
        elif tag == 'tr' and self.table is not None:
            self.table.append([])
        elif tag in ('td', 'th') and self.table is not None:
            if not self.table:
                self.table.append([])
            self.cell = []
            if tag == 'th':
                self.bold += 1
        elif tag in self.BLOCK and self.table is None:
            if tag == 'pre':
                self.pre += 1
                self._start_block('pre')
            elif tag[0] == 'h' and tag[1:].isdigit():
                self._start_block('h', int(tag[1:]))
            elif tag == 'li':
                self._start_block('li')
            else:
                self._start_block('p')

    def handle_endtag(self, tag):
        if tag in self.DROP:
            self.dropping = max(0, self.dropping - 1)
        elif tag in ('strong', 'b'):
            self.bold = max(0, self.bold - 1)
        elif tag in ('em', 'i'):
            self.italic = max(0, self.italic - 1)
        elif tag == 'u':
            self.underline = max(0, self.underline - 1)
        elif tag == 'code':
            self.code = max(0, self.code - 1)
        elif tag in ('ul', 'ol'):
            self._flush()
            if self.lists:
                self.lists.pop()
        elif tag in ('td', 'th') and self.table is not None and self.cell is not None:
            self.table[-1].append(self.cell)
            self.cell = None
            if tag == 'th':
                self.bold = max(0, self.bold - 1)
        elif tag == 'table' and self.table is not None:
            self.blocks.append({'kind': 'table', 'rows': self.table})
            self.table = None
        elif tag in self.BLOCK and self.table is None:
            if tag == 'pre':
                self.pre = max(0, self.pre - 1)
            self._flush()

    def handle_data(self, data):
        self._data(data)

    def _data(self, data, raw=False):
        if self.dropping:
            return
        if not raw and not self.pre:
            data = re.sub(r'\s+', ' ', data)
        if not data or (not raw and not self.pre and not data.strip() and self.cur is None and self.cell is None):
            return
        run = (data, bool(self.bold), bool(self.italic), bool(self.underline), bool(self.code))
        if self.cell is not None:
            self.cell.append(run)
            return
        if self.table is not None:
            return
        if self.cur is None:
            self._start_block('p')
        self.cur['runs'].append(run)

    def close(self):
        super().close()
        self._flush()
