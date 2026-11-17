"""
EduAssignment.Files — test data files for an assignment. Owner: Rohith (assignment engine).
Stored at edu/testdata/<assignmentId>/<fileName>; the list lives in EduAssignment.testDataFiles.
"""

import base64
import binascii
import re

_SAFE_NAME = re.compile(r'^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$')


def uploadTestData(cls, assignmentId, fileName, contentBase64):
    assignment = _staff_assignment(assignmentId)
    name = _clean_name(fileName)
    try:
        data = base64.b64decode(contentBase64 or '', validate=True)
    except (binascii.Error, ValueError):
        raise ValueError('EDU_VALIDATION: file content is not valid base64')
    if len(data) > c3.EduAssignment.Files.MAX_FILE_BYTES:
        raise ValueError('EDU_VALIDATION: %s is %d bytes; the limit is %d' % (name, len(data), c3.EduAssignment.Files.MAX_FILE_BYTES))

    others = [a for a in (assignment.testDataFiles or []) if a.fileName != name]
    if len(others) >= c3.EduAssignment.Files.MAX_FILES:
        raise ValueError('EDU_VALIDATION: an assignment can have at most %d test data files' % c3.EduAssignment.Files.MAX_FILES)

    f = c3.FileSystem.makeFile('edu/testdata/%s/%s' % (assignmentId, name))
    f.write(data)
    files = others + [c3.EduAttachment.make({'fileName': name, 'url': f.url, 'sizeBytes': len(data)})]
    files.sort(key=lambda a: a.fileName)
    c3.EduAssignment.make({'id': assignmentId, 'testDataFiles': files}).merge(mergeInclude='testDataFiles')
    c3.log().info('Stored test data {} ({} bytes) for assignment {}', name, len(data), assignmentId)
    return files


def removeTestData(cls, assignmentId, fileName):
    assignment = _staff_assignment(assignmentId)
    files = list(assignment.testDataFiles or [])
    match = next((a for a in files if a.fileName == fileName), None)
    if match is None:
        raise ValueError('EDU_NOT_FOUND: test data file ' + fileName)
    f = c3.File.make({'url': match.url})
    if f.exists():
        f.delete()
    remaining = [a for a in files if a.fileName != fileName]
    c3.EduAssignment.make({'id': assignmentId, 'testDataFiles': remaining}).merge(mergeInclude='testDataFiles')
    return remaining


def readTestData(cls, assignmentId):
    assignment = c3.EduAssignment.forId(assignmentId)
    if assignment is None:
        raise ValueError('EDU_NOT_FOUND: assignment ' + assignmentId)
    try:
        c3.EduEnrollment.requireCourseRole(assignment.course.id, ['INSTRUCTOR', 'TA'])
    except Exception:
        c3.EduEnrollment.requireCourseRole(assignment.course.id, ['STUDENT'])
        if assignment.status != 'PUBLISHED' and assignment.status != 'CLOSED':
            raise ValueError('EDU_FORBIDDEN: assignment is not published')
    out = []
    for a in assignment.testDataFiles or []:
        data = bytes(c3.File.make({'url': a.url}).read())
        out.append(c3.EduAttachment.Content.make({
            'fileName': a.fileName,
            'contentBase64': base64.b64encode(data).decode('ascii'),
            'sizeBytes': len(data),
        }))
    return out


def _staff_assignment(assignmentId):
    assignment = c3.EduAssignment.forId(assignmentId)
    if assignment is None:
        raise ValueError('EDU_NOT_FOUND: assignment ' + assignmentId)
    c3.EduEnrollment.requireCourseRole(assignment.course.id, ['INSTRUCTOR', 'TA'])
    return assignment


def _clean_name(fileName):
    name = (fileName or '').strip().replace('\\', '/').lstrip('/')
    if not name or '..' in name.split('/') or not _SAFE_NAME.match(name):
        raise ValueError('EDU_VALIDATION: "%s" is not a valid file path (letters, digits, . _ - and / only)' % fileName)
    return name
