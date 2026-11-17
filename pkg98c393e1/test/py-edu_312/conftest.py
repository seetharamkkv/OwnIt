"""
Shared fixtures for the assignment engine tests (same as test/py-data_312/conftest.py; keep them in sync). Owner: Rohith.
Each test module gets its own course, people, and assignment ids so reruns never collide.
"""
import uuid
from typing import TYPE_CHECKING

import pytest

if TYPE_CHECKING:  # editor-only; c3 is injected at runtime
    c3 = {}


def unique(prefix):
    return '%s_%s' % (prefix, uuid.uuid4().hex[:10])


def make_course(ctx):
    """A course with one student; the runner (an admin) passes every staff check."""
    # The test runner is the test app's own user: give it an ADMIN profile so staff checks pass.
    c3.EduUserProfile.make({'id': c3.User.myUser().id, 'displayName': 'Test runner', 'platformRole': 'ADMIN'}).merge()
    course_id = unique('test_course')
    student_id = unique('test_student')
    c3.TestApi.createEntity(ctx, 'EduCourse', {'id': course_id, 'code': course_id, 'title': 'Test course'})
    c3.TestApi.createEntity(ctx, 'EduUserProfile', {'id': student_id, 'displayName': 'Test Student', 'platformRole': 'STUDENT'})
    c3.TestApi.createEntity(ctx, 'EduEnrollment', {
        'id': unique('test_enr'), 'course': {'id': course_id}, 'person': {'id': student_id}, 'courseRole': 'STUDENT',
    })
    c3.TestApi.waitForSetup(ctx)
    return course_id, student_id


def make_assignment(ctx, course_id, file_kind, template):
    """Creates an assignment and imports its template; steps made by importTemplate are torn down too."""
    assignment_id = unique('test_asg')
    c3.TestApi.createEntity(ctx, 'EduAssignment', {
        'id': assignment_id, 'course': {'id': course_id}, 'title': 'Test assignment', 'fileKind': file_kind,
    })
    c3.TestApi.waitForSetup(ctx)
    c3.TestApi.addExternalTeardownFilter(ctx, c3.Filter.eq('assignment.id', assignment_id).toString(), 'EduAssignmentStep', 100)
    c3.TestApi.addExternalTeardownFilter(ctx, c3.Filter.eq('assignment.id', assignment_id).toString(), 'EduSubmission', 100)
    result = c3.EduTemplateParser.importTemplate(assignment_id, template, None)
    return assignment_id, result


def make_submission(ctx, assignment_id, student_id, answers):
    """answers: {markerId: content}. Returns the submission id."""
    submission_id = unique('test_sub')
    c3.TestApi.createEntity(ctx, 'EduSubmission', {
        'id': submission_id, 'assignment': {'id': assignment_id}, 'student': {'id': student_id}, 'status': 'IN_PROGRESS',
    })
    rows = [{
        'id': unique('test_resp'), 'submission': {'id': submission_id}, 'step': {'id': '%s_%s' % (assignment_id, marker)},
        'content': content,
    } for marker, content in answers.items()]
    if rows:
        c3.TestApi.createBatchEntity(ctx, 'EduStepResponse', rows)
    c3.TestApi.waitForSetup(ctx)
    return submission_id


def delete_file(url):
    if url:
        f = c3.File.make({'url': url})
        if f.exists():
            f.delete()


@pytest.fixture(scope='module')
def ctx(request):
    ctx = c3.TestApi.createContext(request.module.__name__)
    yield ctx
    c3.TestApi.teardown(ctx)
