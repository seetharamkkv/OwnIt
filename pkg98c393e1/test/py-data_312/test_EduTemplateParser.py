"""
Unit tests for EduTemplateParser.parse (PY and IPYNB). Owner: Rohith.
Pure parsing: nothing is persisted.
"""
import json
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:  # editor-only; c3 is injected at runtime
    c3 = {}


PY_TEMPLATE = (
    'import x\n'
    '\n'
    '\n'
    'def f():\n'
    '    # <<STEP id="one" title="First" points="2">>\n'
    '    # Do the first thing.\n'
    '    # Use **x**.\n'
    '    pass\n'
    '    # <<END STEP>>\n'
    '\n'
    '\n'
    'def g():\n'
    '    # <<STEP id="two">>\n'
    '    return 1\n'
    '    # <<END STEP>>\n'
    '\n'
    'print(f(), g())\n'
)

# The same file with markers and instruction comments removed.
PY_REBUILT = (
    'import x\n'
    '\n'
    '\n'
    'def f():\n'
    '    pass\n'
    '\n'
    '\n'
    'def g():\n'
    '    return 1\n'
    '\n'
    'print(f(), g())\n'
)


def _parse(kind, text):
    return c3.EduTemplateParser.parse(kind, text)


def _warnings(result):
    return list(result.warnings or [])


def test_py_finds_steps_in_order_with_marker_attributes():
    res = _parse('PY', PY_TEMPLATE)
    assert [s.markerId for s in res.steps] == ['one', 'two']
    assert [s.stepOrder for s in res.steps] == [1, 2]
    assert res.steps[0].title == 'First'
    assert res.steps[0].points == 2
    assert _warnings(res) == []


def test_py_leading_comments_become_instructions_and_the_rest_is_starter():
    first = _parse('PY', PY_TEMPLATE).steps[0]
    assert first.instructionsMd == 'Do the first thing.\nUse **x**.'
    assert first.starterContent == '    pass\n'


def test_py_title_defaults_to_marker_id_without_instructions():
    second = _parse('PY', PY_TEMPLATE).steps[1]
    assert second.title == 'two'
    assert second.points is None


def test_py_context_gaps_rebuild_the_file_without_markers():
    steps = _parse('PY', PY_TEMPLATE).steps
    rebuilt = ''.join((s.contextBefore or '') + (s.starterContent or '') for s in steps) + (steps[-1].contextAfter or '')
    assert rebuilt == PY_REBUILT


def test_py_context_after_is_the_next_steps_context_before():
    steps = _parse('PY', PY_TEMPLATE).steps
    assert steps[0].contextAfter == steps[1].contextBefore


@pytest.mark.parametrize(
    'template, expected_warning, expected_ids',
    [
        ('# <<STEP id="a">>\nx\n# <<END STEP>>\n# <<STEP id="a">>\ny\n# <<END STEP>>\n', 'duplicate id "a"', ['a', 'a_2']),
        ('# <<STEP id="a">>\nx\n# <<STEP id="b">>\ny\n# <<END STEP>>\n', 'nested steps are not allowed', ['a', 'b']),
        ('# <<STEP id="a">>\nx\n', 'never closed', ['a']),
        ('x = 1\n# <<END STEP>>\n', 'END STEP without a matching STEP', []),
        ('# <<STEP title="no id">>\nx\n# <<END STEP>>\n', 'step has no id', ['step1']),
        ('# <<STEP id="bad id!">>\nx\n# <<END STEP>>\n', 'changed to "bad_id_"', ['bad_id_']),
        ('# <<STEP id="a" points="lots">>\nx\n# <<END STEP>>\n', 'points="lots" is not a number', ['a']),
    ],
)
def test_py_reports_marker_problems(template, expected_warning, expected_ids):
    res = _parse('PY', template)
    assert [s.markerId for s in res.steps] == expected_ids
    assert any(expected_warning in w for w in _warnings(res)), _warnings(res)


def test_py_without_markers_warns_and_has_no_steps():
    res = _parse('PY', 'print("hello")\n')
    assert list(res.steps or []) == []
    assert any('No steps found' in w for w in _warnings(res))


def _cell(kind, source, meta=None):
    cell = {'cell_type': kind, 'metadata': meta or {}, 'source': source}
    if kind == 'code':
        cell.update({'execution_count': None, 'outputs': []})
    return cell


NOTEBOOK = {
    'nbformat': 4,
    'nbformat_minor': 5,
    'metadata': {},
    'cells': [
        _cell('markdown', '# Lab'),
        _cell('code', ['import pandas as pd\n', 'df = pd.DataFrame()\n']),
        _cell('code', '# Compute the mean.\nmean = None\n', {'edu': {'step': 'mean', 'title': 'Mean', 'points': 2}}),
        _cell('markdown', 'Next part'),
        _cell('code', '# <<STEP id="last" points="1">>\n# Store the answer.\nanswer = None\n# <<END STEP>>\n'),
    ],
}


def test_ipynb_metadata_and_marker_cells_become_steps():
    res = _parse('IPYNB', json.dumps(NOTEBOOK))
    assert [(s.markerId, s.cellIndex, s.points) for s in res.steps] == [('mean', 2, 2), ('last', 4, 1)]
    assert res.steps[0].title == 'Mean'
    assert res.steps[0].instructionsMd == 'Compute the mean.'
    assert res.steps[0].starterContent == 'mean = None\n'
    assert res.steps[1].instructionsMd == 'Store the answer.'
    assert res.steps[1].starterContent == 'answer = None\n'
    assert _warnings(res) == []


def test_ipynb_context_joins_the_cells_between_steps():
    steps = _parse('IPYNB', json.dumps(NOTEBOOK)).steps
    assert steps[0].contextBefore == '# Lab\n\nimport pandas as pd\ndf = pd.DataFrame()\n'
    assert steps[1].contextBefore == 'Next part'
    assert (steps[1].contextAfter or '') == ''


def test_ipynb_markdown_cell_cannot_be_a_step():
    nb = dict(NOTEBOOK, cells=[_cell('markdown', 'text', {'edu': {'step': 'x'}})])
    res = _parse('IPYNB', json.dumps(nb))
    assert list(res.steps or []) == []
    assert any('only code cells can be steps' in w for w in _warnings(res))


@pytest.mark.parametrize('text', ['{not json', '{"cells": "nope"}'])
def test_ipynb_invalid_notebook_is_rejected(text):
    with pytest.raises(Exception, match='EDU_VALIDATION'):
        _parse('IPYNB', text)
