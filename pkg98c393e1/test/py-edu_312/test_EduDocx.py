"""
DOCX parsing and assembly (needs python-docx, so it runs in py-edu_312). Owner: Rohith.
"""
import base64
import io
from typing import TYPE_CHECKING

import pytest

from conftest import delete_file, make_assignment, make_course, make_submission

if TYPE_CHECKING:  # editor-only; c3 is injected at runtime
    c3 = {}


def _template():
    from docx import Document
    doc = Document()
    doc.add_heading('Report', 1)
    doc.add_paragraph('Answer in full sentences.')
    # Word turns straight quotes into curly ones; the parser must accept both.
    doc.add_paragraph('{{STEP id=\u201cintro\u201d title=\u201cIntroduction\u201d points=\u201c2\u201d instructions=\u201cSay what you did.\u201d}}')
    starter = doc.add_paragraph('Write here.')
    starter.runs[0].italic = True
    doc.add_paragraph('{{END STEP}}')
    doc.add_heading('Results', 2)
    doc.add_paragraph('{{STEP id="results"}}')
    doc.add_paragraph('Kept as context because this step has no END marker.')
    buf = io.BytesIO()
    doc.save(buf)
    return base64.b64encode(buf.getvalue()).decode('ascii')


def _texts(data):
    from docx import Document
    doc = Document(io.BytesIO(data))
    return [(p.style.name, p.text) for p in doc.paragraphs], doc


def test_parse_reads_markers_with_curly_quotes():
    res = c3.EduTemplateParser.parse('DOCX', _template())
    assert list(res.warnings or []) == []
    intro, results = res.steps
    assert (intro.markerId, intro.title, intro.points, intro.instructionsMd) == ('intro', 'Introduction', 2, 'Say what you did.')
    assert intro.starterContent == '<p><em>Write here.</em></p>'
    assert intro.contextBefore == '<h1>Report</h1><p>Answer in full sentences.</p>'
    assert (results.starterContent or '') == ''
    assert results.contextBefore == '<h2>Results</h2>'
    assert results.contextAfter == '<p>Kept as context because this step has no END marker.</p>'


def test_parse_rejects_non_docx_content():
    with pytest.raises(Exception, match='EDU_VALIDATION'):
        c3.EduTemplateParser.parse('DOCX', base64.b64encode(b'not a zip').decode('ascii'))


@pytest.fixture(scope='module')
def docx_setup(ctx):
    course_id, student_id = make_course(ctx)
    assignment_id, _ = make_assignment(ctx, course_id, 'DOCX', _template())
    submission_id = make_submission(ctx, assignment_id, student_id, {
        'intro': '<h3>Goal</h3><p>We used <strong>bold</strong> and <em>italic</em>.</p>'
                 '<ul><li>one</li><li>two</li></ul><script>alert(1)</script>',
        'results': '<table><tr><th>V</th><th>I</th></tr><tr><td>1</td><td>0.1</td></tr></table>',
    })
    yield {'assignment': assignment_id, 'submission': submission_id}
    sub = c3.EduSubmission.forId(submission_id)
    delete_file(sub.assembledFileUrl if sub else None)


def test_assemble_replaces_regions_with_word_formatting(docx_setup):
    url = c3.EduAssembler.assemble(docx_setup['submission'])
    assert url.endswith('/assembled.docx')
    paragraphs, doc = _texts(bytes(c3.File.make({'url': url}).read()))
    texts = [t for _, t in paragraphs]
    assert not any('{{' in t for t in texts), 'markers must not reach the final file'
    assert 'Write here.' not in texts, 'starter text is replaced by the answer'
    assert ('Heading 3', 'Goal') in paragraphs
    assert ('List Bullet', 'one') in paragraphs and ('List Bullet', 'two') in paragraphs
    assert 'alert(1)' not in ' '.join(texts), 'script content is dropped'
    bold = [r.text for p in doc.paragraphs for r in p.runs if r.bold]
    assert 'bold' in bold
    assert [[c.text for c in row.cells] for row in doc.tables[0].rows] == [['V', 'I'], ['1', '0.1']]
    assert texts[-1] == 'Kept as context because this step has no END marker.'


def test_preview_uses_starter_content(docx_setup):
    link = c3.EduAssembler.previewTemplate(docx_setup['assignment'])
    assert link.startswith('https://')
