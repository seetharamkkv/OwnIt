"""
Security test for EduAssignment's publishing rule: a TA cannot publish or close, an instructor can. Owner: Rohith.
Uses dev personas, so it turns the devPersonas flag on in the test app for the duration of the module.
"""
from typing import TYPE_CHECKING

import pytest

from conftest import unique

if TYPE_CHECKING:  # editor-only; c3 is injected at runtime
    c3 = {}


@pytest.fixture(scope='module')
def people(ctx):
    # Dev personas need the caller to be an Edu admin. The test runner is the test app's own user, so make it one.
    runner = c3.User.myUser().id
    c3.EduUserProfile.make({'id': runner, 'displayName': 'Test runner', 'platformRole': 'ADMIN'}).merge()
    config = c3.EduPlatformConfig.inst()
    original = dict(config.featureFlags or {})
    config.setConfigValue('featureFlags', dict(original, devPersonas=True), c3.ConfigOverride.APP)

    course_id = unique('test_course_pub')
    ta_id, instructor_id = unique('test_ta'), unique('test_instr')
    c3.TestApi.createEntity(ctx, 'EduCourse', {'id': course_id, 'code': course_id, 'title': 'Publishing'})
    c3.TestApi.createBatchEntity(ctx, 'EduUserProfile', [
        {'id': ta_id, 'displayName': 'TA', 'platformRole': 'INSTRUCTOR'},
        {'id': instructor_id, 'displayName': 'Instructor', 'platformRole': 'INSTRUCTOR'},
    ])
    c3.TestApi.createBatchEntity(ctx, 'EduEnrollment', [
        {'id': unique('test_enr'), 'course': {'id': course_id}, 'person': {'id': ta_id}, 'courseRole': 'TA'},
        {'id': unique('test_enr'), 'course': {'id': course_id}, 'person': {'id': instructor_id}, 'courseRole': 'INSTRUCTOR'},
    ])
    c3.TestApi.waitForSetup(ctx)
    c3.TestApi.addExternalTeardownFilter(ctx, c3.Filter.eq('course.id', course_id).toString(), 'EduAssignment', 100)
    yield {'course': course_id, 'ta': ta_id, 'instructor': instructor_id}
    c3.EduSession.setDevPersona(None)
    config.setConfigValue('featureFlags', original, c3.ConfigOverride.APP)


def _draft(course_id):
    return c3.EduAssignment.make({'title': 'Draft', 'fileKind': 'PY', 'course': {'id': course_id}, 'status': 'DRAFT'}).create()


def test_ta_can_create_and_edit_a_draft(people):
    c3.EduSession.setDevPersona(people['ta'])
    try:
        a = _draft(people['course'])
        c3.EduAssignment.make({'id': a.id, 'title': 'Edited'}).merge()
        assert c3.EduAssignment.forId(a.id).title == 'Edited'
    finally:
        c3.EduSession.setDevPersona(None)


@pytest.mark.parametrize('status', ['PUBLISHED', 'CLOSED'])
def test_ta_cannot_publish_or_close(people, status):
    a = _draft(people['course'])
    c3.EduSession.setDevPersona(people['ta'])
    try:
        with pytest.raises(Exception, match='EDU_FORBIDDEN'):
            c3.EduAssignment.make({'id': a.id, 'status': status}).merge()
        with pytest.raises(Exception, match='EDU_FORBIDDEN'):
            c3.EduAssignment.make({'title': 'Direct', 'fileKind': 'PY', 'course': {'id': people['course']}, 'status': status}).create()
    finally:
        c3.EduSession.setDevPersona(None)
    assert c3.EduAssignment.forId(a.id).status == 'DRAFT'


def test_instructor_can_publish(people):
    a = _draft(people['course'])
    c3.EduSession.setDevPersona(people['instructor'])
    try:
        c3.EduAssignment.make({'id': a.id, 'status': 'PUBLISHED'}).merge()
    finally:
        c3.EduSession.setDevPersona(None)
    assert c3.EduAssignment.forId(a.id).status == 'PUBLISHED'
