"""
Tests for EduAssignment.Files (test data upload / read / remove). Owner: Rohith.
"""
import base64
from typing import TYPE_CHECKING

import pytest

from conftest import make_course, unique

if TYPE_CHECKING:  # editor-only; c3 is injected at runtime
    c3 = {}


@pytest.fixture(scope='module')
def assignment_id(ctx):
    course_id, _ = make_course(ctx)
    aid = unique('test_asg_files')
    c3.TestApi.createEntity(ctx, 'EduAssignment', {'id': aid, 'course': {'id': course_id}, 'title': 'Files', 'fileKind': 'PY'})
    c3.TestApi.waitForSetup(ctx)
    yield aid
    for f in c3.EduAssignment.forId(aid).testDataFiles or []:
        c3.EduAssignment.Files.removeTestData(aid, f.fileName)


def _b64(text):
    return base64.b64encode(text.encode()).decode('ascii')


def test_upload_lists_and_reads_back_the_file(assignment_id):
    files = c3.EduAssignment.Files.uploadTestData(assignment_id, 'data/sales.csv', _b64('a,b\n1,2\n'))
    assert [(f.fileName, f.sizeBytes) for f in files] == [('data/sales.csv', 8)]
    contents = {c.fileName: base64.b64decode(c.contentBase64).decode() for c in c3.EduAssignment.Files.readTestData(assignment_id)}
    assert contents == {'data/sales.csv': 'a,b\n1,2\n'}


def test_upload_with_the_same_name_replaces_the_file(assignment_id):
    c3.EduAssignment.Files.uploadTestData(assignment_id, 'data/sales.csv', _b64('new\n'))
    files = c3.EduAssignment.Files.uploadTestData(assignment_id, 'data/sales.csv', _b64('newer\n'))
    assert [(f.fileName, f.sizeBytes) for f in files] == [('data/sales.csv', 6)]


def test_remove_deletes_the_file_from_the_list(assignment_id):
    c3.EduAssignment.Files.uploadTestData(assignment_id, 'data/extra.txt', _b64('x'))
    files = c3.EduAssignment.Files.removeTestData(assignment_id, 'data/extra.txt')
    assert 'data/extra.txt' not in [f.fileName for f in files]


def test_leading_slash_is_stripped(assignment_id):
    files = c3.EduAssignment.Files.uploadTestData(assignment_id, '/data/slash.csv', _b64('x'))
    assert 'data/slash.csv' in [f.fileName for f in files]
    c3.EduAssignment.Files.removeTestData(assignment_id, 'data/slash.csv')


@pytest.mark.parametrize('bad_name', ['../secret.txt', 'data/../../x', 'has space.csv', 'semi;colon.csv', 'data/'])
def test_unsafe_paths_are_rejected(assignment_id, bad_name):
    with pytest.raises(Exception, match='EDU_VALIDATION'):
        c3.EduAssignment.Files.uploadTestData(assignment_id, bad_name, _b64('x'))


def test_blank_name_is_rejected(assignment_id):
    # The platform rejects a blank required argument before the method runs.
    with pytest.raises(Exception):
        c3.EduAssignment.Files.uploadTestData(assignment_id, '   ', _b64('x'))


def test_invalid_base64_is_rejected(assignment_id):
    with pytest.raises(Exception, match='EDU_VALIDATION'):
        c3.EduAssignment.Files.uploadTestData(assignment_id, 'data/x.csv', 'not base64!!')


def test_removing_a_missing_file_fails(assignment_id):
    with pytest.raises(Exception, match='EDU_NOT_FOUND'):
        c3.EduAssignment.Files.removeTestData(assignment_id, 'data/nope.csv')
