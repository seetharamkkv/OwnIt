/*
 * Course home with tabs. Owner: Shreya (shell); each tab's content belongs to the listed owner.
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Container } from '@/components/ui/container';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { fetchCourse } from '@/common/api';
import { useCourseRole, useMe } from '@/common/auth/useMe';
import { eduErrorMessage } from '@/common/errors';
import { PageMessage } from '@/common/PageMessage';
import { queryKeys } from '@/common/queryKeys';
import { routes } from '@/common/routes';
import { CourseAssignmentList } from '@/features/authoring/CourseAssignmentList';
import { StudentGradesList } from '@/features/grading/StudentGradesPage';
import { CourseQuizList, MyQuizList } from '@/features/quiz/QuizLists';
import { MyAssignmentList } from '@/features/workspace/MyAssignmentList';

export default function CourseHomePage() {
  const { courseId = '' } = useParams();
  const navigate = useNavigate();
  const { me } = useMe();
  const courseRole = useCourseRole(courseId);
  const course = useQuery({ queryKey: queryKeys.course(courseId), queryFn: () => fetchCourse(courseId) });
  const isStaff = me?.platformRole === 'ADMIN' || courseRole === 'INSTRUCTOR' || courseRole === 'TA';

  if (course.isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }
  if (course.error) {
    return <PageMessage title="Could not load the course" message={eduErrorMessage(course.error)} />;
  }
  if (!course.data) {
    return <PageMessage title="Course not found" />;
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">
          {course.data.code} · {course.data.title}
        </h1>
        <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">{course.data.term}</p>
      </div>

      <Tabs variant="bordered" defaultValue="assignments">
        <TabsList>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="quizzes">Quizzes</TabsTrigger>
          <TabsTrigger value="grades">Grades</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
        </TabsList>
        <TabsContent value="assignments">
          <Container
            title="Assignments"
            subtitle="Students: list from EduSubmission.myAssignments (Keya). Staff: authoring list (Rohith)."
          >
            {isStaff ? (
              <CourseAssignmentList courseId={courseId} />
            ) : (
              <MyAssignmentList courseId={courseId} />
            )}
          </Container>
        </TabsContent>
        <TabsContent value="quizzes">
          <Container title="Quizzes" subtitle={isStaff ? 'Build, publish and grade quizzes.' : 'Timed, proctored quizzes for this course.'}>
            {isStaff ? <CourseQuizList courseId={courseId} /> : <MyQuizList courseId={courseId} />}
          </Container>
        </TabsContent>
        <TabsContent value="grades">
          <Container title="Grades" subtitle="Owner: Shreenidhi (gradebook) and Seetharam (integrity)">
            {isStaff ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" appearance="secondary" onClick={() => navigate(routes.gradebook(courseId))}>
                  Gradebook
                </Button>
                <Button variant="outline" appearance="secondary" onClick={() => navigate(routes.integrity(courseId))}>
                  Integrity dashboard
                </Button>
              </div>
            ) : (
              <StudentGradesList courseId={courseId} />
            )}
          </Container>
        </TabsContent>
        <TabsContent value="people">
          <Container title="People" subtitle="Owner: Shreya — enrollments and bulk CSV import (EduEnrollment.bulkEnroll)">
            <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">Not built yet.</p>
          </Container>
        </TabsContent>
      </Tabs>
    </div>
  );
}
