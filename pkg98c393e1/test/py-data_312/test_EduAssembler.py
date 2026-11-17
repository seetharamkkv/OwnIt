"""
Integration tests for EduTemplateParser.importTemplate and EduAssembler (PY and IPYNB). Owner: Rohith.
"""
import json
from typing import TYPE_CHECKING

import pytest

from conftest import delete_file, make_assignment, make_course, make_submission

if TYPE_CHECKING:  # editor-only; c3 is injected at runtime
    c3 = {}


PY_TEMPLATE = (
    'def load():\n'
    '    # <<STEP id="load" points="1">>\n'
    '    # Return 1.\n'
    '    pass\n'
    '    # <<END STEP>>\n'
    '\n'
    'def double():\n'
    '    # <<STEP id="double" points="1">>\n'
    '    pass\n'
    '    # <<END STEP>>\n'
    '\n'
    'print(double())\n'
)


@pytest.fixture(scope='module')
def py_setup(ctx):
    course_id, student_id = make_course(ctx)
    assignment_id, result = make_assignment(ctx, course_id, 'PY', PY_TEMPLATE)
    submission_id = make_submission(ctx, assignment_id, student_id, {'load': '    return 1\n'})
    yield {'course': course_id, 'assignment': assignment_id, 'submission': submission_id, 'import': result}
    delete_file(c3.EduSubmission.forId(submission_id).assembledFileUrl if c3.EduSubmission.forId(submission_id) else None)


def _steps(assignment_id):
    return c3.EduAssignmentStep.fetch({
        'filter': c3.Filter.eq('assignment.id', assignment_id), 'order': 'ascending(stepOrder)', 'limit': 50,
    }).objs or []


def test_import_stores_steps_with_stable_ids(py_setup):
    steps = _steps(py_setup['assignment'])
    assert [s.id for s in steps] == ['%s_load' % py_setup['assignment'], '%s_double' % py_setup['assignment']]
    assert steps[0].instructionsMd == 'Return 1.'
    assert c3.EduAssignment.forId(py_setup['assignment']).templateContent == PY_TEMPLATE


def test_assemble_up_to_uses_answers_then_starter_code(py_setup):
    program = c3.EduAssembler.assembleUpTo(py_setup['submission'], 1)
    assert program == 'def load():\n    return 1\n\ndef double():\n    pass\n\nprint(double())\n'


def test_assemble_up_to_earlier_step_ignores_later_answers(py_setup):
    program = c3.EduAssembler.assembleUpTo(py_setup['submission'], 0)
    assert '    return 1\n' not in program


def test_assemble_writes_the_file_and_records_its_url(py_setup):
    url = c3.EduAssembler.assemble(py_setup['submission'])
    assert url.endswith('/assembled.py')
    assert c3.File.make({'url': url}).readString() == c3.EduAssembler.assembleUpTo(py_setup['submission'], 2)
    assert c3.EduSubmission.forId(py_setup['submission']).assembledFileUrl == url


def test_download_link_is_presigned(py_setup):
    assert c3.EduAssembler.downloadLink(py_setup['submission']).startswith('https://')


def test_reimport_keeps_answered_steps_and_removes_unanswered_ones(py_setup):
    renamed = PY_TEMPLATE.replace('id="double"', 'id="triple"')
    result = c3.EduTemplateParser.importTemplate(py_setup['assignment'], renamed, None)
    ids = sorted(s.markerId for s in _steps(py_setup['assignment']))
    assert ids == ['load', 'triple']  # "double" had no answers, so it was removed
    removed_with_answers = PY_TEMPLATE.replace('id="load"', 'id="fetch"')
    result = c3.EduTemplateParser.importTemplate(py_setup['assignment'], removed_with_answers, None)
    assert any('"load" is no longer in the template' in w for w in (result.warnings or []))
    assert 'load' in [s.markerId for s in _steps(py_setup['assignment'])]
    # restore the original template for the other tests in this module
    c3.EduTemplateParser.importTemplate(py_setup['assignment'], PY_TEMPLATE, None)


def test_import_without_content_reimports_the_stored_template(py_setup):
    result = c3.EduTemplateParser.importTemplate(py_setup['assignment'], None, None)
    assert [s.markerId for s in result.steps] == ['load', 'double']


NOTEBOOK = {
    'nbformat': 4,
    'nbformat_minor': 5,
    'metadata': {},
    'cells': [
        {'cell_type': 'markdown', 'metadata': {}, 'source': '# Lab'},
        {'cell_type': 'code', 'metadata': {}, 'execution_count': 3, 'outputs': [{'output_type': 'stream', 'name': 'stdout', 'text': 'x'}], 'source': 'a = 1\n'},
        {'cell_type': 'code', 'metadata': {'edu': {'step': 'b'}}, 'execution_count': None, 'outputs': [], 'source': 'b = None\n'},
        {'cell_type': 'code', 'metadata': {'edu': {'step': 'c'}}, 'execution_count': None, 'outputs': [], 'source': 'c = None\n'},
    ],
}


@pytest.fixture(scope='module')
def nb_setup(ctx):
    course_id, student_id = make_course(ctx)
    assignment_id, _ = make_assignment(ctx, course_id, 'IPYNB', json.dumps(NOTEBOOK))
    submission_id = make_submission(ctx, assignment_id, student_id, {'b': 'b = a + 1\n', 'c': 'c = b * 2\n'})
    yield {'assignment': assignment_id, 'submission': submission_id}
    sub = c3.EduSubmission.forId(submission_id)
    delete_file(sub.assembledFileUrl if sub else None)


def test_ipynb_assemble_up_to_joins_code_cells_through_the_step(nb_setup):
    assert c3.EduAssembler.assembleUpTo(nb_setup['submission'], 1) == 'a = 1\n\n\nb = a + 1\n'


def test_ipynb_assemble_replaces_step_cells_and_clears_their_outputs(nb_setup):
    url = c3.EduAssembler.assemble(nb_setup['submission'])
    nb = json.loads(c3.File.make({'url': url}).readString())
    assert nb['nbformat'] == 4
    assert [c['source'] for c in nb['cells']] == ['# Lab', 'a = 1\n', 'b = a + 1\n', 'c = b * 2\n']
    assert nb['cells'][2]['outputs'] == [] and nb['cells'][2]['execution_count'] is None
    assert nb['cells'][1]['outputs'], 'non-step cells keep their outputs'


def test_missing_submission_is_not_found():
    with pytest.raises(Exception, match='EDU_NOT_FOUND'):
        c3.EduAssembler.assembleUpTo('missing_submission', 1)
