/*
 * EduQuizQuestion — the question pool of a quiz. Owner: Shreenidhi (tests, grading, quizzes). PROJECT_PLAN.md 7.4.
 * Staff only: students see questions through EduQuizAttempt.startMine, which never includes the answer key.
 */

var log = Logger.for('EduQuizQuestion');

var STAFF_ROLES = ['INSTRUCTOR', 'TA'];
var CHOICE_KINDS = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'TRUE_FALSE'];
var MAX_PROMPT = 20000;
var MAX_LABEL = 2000;
var MAX_OPTIONS = 20;
var MAX_ACCEPTED = 50;
var MAX_CODE_CHARS = 50000;

var QUESTION_OUT = [
  'id, quiz.id, questionOrder, questionKind, promptMd, options, correctOptionIds, acceptedAnswers, codeStarter',
  'points, poolTag, meta.updated',
].join(', ');

/** Fields a save writes; unset values clear the field. */
var SAVE_FIELDS = 'questionOrder, questionKind, promptMd, options, correctOptionIds, acceptedAnswers, codeStarter, points, poolTag';

function forQuiz(quizId) {
  var quiz = loadQuiz(quizId);
  EduEnrollment.requireCourseRole(quiz.course.id, STAFF_ROLES);
  return sortedQuestions(quizId, QUESTION_OUT);
}

function saveForQuiz(question) {
  if (!question) {
    throw new Error('EDU_VALIDATION: a question is required');
  }
  var quizId;
  var existing = null;
  if (question.id) {
    existing = EduQuizQuestion.make({ id: question.id }).get('quiz.id, questionKind, questionOrder');
    if (!existing || !existing.quiz) {
      throw new Error('EDU_NOT_FOUND: question ' + question.id);
    }
    if (question.quiz && question.quiz.id && question.quiz.id != existing.quiz.id) {
      throw new Error("EDU_VALIDATION: a question can't move to another quiz");
    }
    quizId = existing.quiz.id;
  } else {
    if (!question.quiz || !question.quiz.id) {
      throw new Error('EDU_VALIDATION: a question needs a quiz');
    }
    quizId = question.quiz.id;
  }
  var quiz = loadQuiz(quizId);
  EduEnrollment.requireCoursePermission(quiz.course.id, EduCourse.Permission.EDIT_CONTENT);

  if (existing && existing.questionKind != question.questionKind && hasAttempts(quizId)) {
    throw new Error("EDU_VALIDATION: students have taken this quiz, so the question kind can't change");
  }

  var clean = cleanQuestion(question);
  if (clean.problem) {
    throw new Error('EDU_VALIDATION: ' + clean.problem);
  }
  var fields = clean.fields;
  fields.poolTag = question.poolTag ? String(question.poolTag).trim() || null : null;
  if (question.questionOrder != null) {
    fields.questionOrder = question.questionOrder;
  } else {
    fields.questionOrder = existing && existing.questionOrder != null ? existing.questionOrder : nextOrder(quizId);
  }

  var id;
  if (existing) {
    fields.id = question.id;
    EduQuizQuestion.make(fields).merge(SAVE_FIELDS);
    id = question.id;
  } else {
    fields.quiz = { id: quizId };
    if (question.id) {
      fields.id = question.id;
    }
    id = EduQuizQuestion.make(fields).create().id;
  }
  log.info('Saved quiz question {} on {}', id, quizId);
  return EduQuizQuestion.make({ id: id }).get(QUESTION_OUT);
}

function removeForQuiz(questionId) {
  var q = EduQuizQuestion.make({ id: questionId }).get('quiz.id');
  if (!q || !q.quiz) {
    return false;
  }
  var quiz = loadQuiz(q.quiz.id);
  EduEnrollment.requireCoursePermission(quiz.course.id, EduCourse.Permission.EDIT_CONTENT);
  if (hasAttempts(q.quiz.id)) {
    throw new Error("EDU_VALIDATION: students have taken this quiz, so its questions can't be removed");
  }
  var tests = EduStepTest.arrayBuilder();
  EduStepTest.fetchObjStream({ filter: Filter.eq('question.id', questionId), include: 'id' }).each(function (t) {
    tests.add(t);
  });
  var t = tests.build();
  if (!t.isEmpty()) {
    EduStepTest.removeBatch(t);
  }
  EduQuizQuestion.make({ id: questionId }).remove();
  log.info('Removed quiz question {} from {}', questionId, q.quiz.id);
  return true;
}

function checkQuiz(quizId) {
  var quiz = EduQuiz.make({ id: quizId }).get('course.id, questionsPerAttempt');
  if (!quiz || !quiz.course) {
    throw new Error('EDU_NOT_FOUND: quiz ' + quizId);
  }
  EduEnrollment.requireCourseRole(quiz.course.id, STAFF_ROLES);
  var questions = sortedQuestions(quizId, QUESTION_OUT);
  var problems = ArrayType.ofStr().makeBuilder();
  if (questions.isEmpty()) {
    problems.add('The quiz has no questions');
  }
  var n = 0;
  questions.each(function (q) {
    n++;
    var clean = cleanQuestion(q);
    if (clean.problem) {
      problems.add('Question ' + n + ': ' + clean.problem);
    }
  });
  if (quiz.questionsPerAttempt != null && quiz.questionsPerAttempt > questions.length) {
    problems.add('Questions per attempt (' + quiz.questionsPerAttempt + ') is more than the pool has (' + questions.length + ')');
  }
  return problems.build();
}

/* ---- validation ------------------------------------------------------------------------------------------------ */

/**
 * { problem, fields }: the first problem found, or the fields to save for the question's kind (fields that don't
 * apply are null, so a kind change clears them).
 */
function cleanQuestion(q) {
  var kind = q.questionKind;
  var known = false;
  EduQuizQuestion.QuestionKind.values().each(function (k) {
    if (k == kind) {
      known = true;
    }
  });
  if (!known) {
    return { problem: 'unknown question kind ' + kind };
  }
  var prompt = q.promptMd != null ? String(q.promptMd) : '';
  if (!prompt.trim()) {
    return { problem: 'needs a prompt' };
  }
  if (prompt.length > MAX_PROMPT) {
    return { problem: 'the prompt is longer than ' + MAX_PROMPT + ' characters' };
  }
  var points = q.points != null ? q.points : 1;
  if (isNaN(points) || points < 0) {
    return { problem: "points can't be negative" };
  }
  var fields = {
    questionKind: kind,
    promptMd: prompt,
    points: points,
    options: null,
    correctOptionIds: null,
    acceptedAnswers: null,
    codeStarter: null,
  };

  if (CHOICE_KINDS.indexOf(kind) >= 0) {
    var options = [];
    if (q.options) {
      q.options.each(function (o) {
        options.push({ optionId: o.optionId != null ? String(o.optionId).trim() : '', label: o.label != null ? String(o.label) : '' });
      });
    }
    if (kind == 'TRUE_FALSE' && !options.length) {
      options = [
        { optionId: 'true', label: 'True' },
        { optionId: 'false', label: 'False' },
      ];
    }
    if (options.length < 2) {
      return { problem: 'needs at least 2 options' };
    }
    if (options.length > MAX_OPTIONS) {
      return { problem: 'has more than ' + MAX_OPTIONS + ' options' };
    }
    var ids = {};
    for (var i = 0; i < options.length; i++) {
      var o = options[i];
      if (!o.optionId) {
        return { problem: 'option ' + (i + 1) + ' needs an id' };
      }
      if (ids[o.optionId]) {
        return { problem: 'option id ' + o.optionId + ' is used twice' };
      }
      if (!o.label.trim()) {
        return { problem: 'option ' + (i + 1) + ' needs a label' };
      }
      if (o.label.length > MAX_LABEL) {
        return { problem: 'option ' + (i + 1) + ' is longer than ' + MAX_LABEL + ' characters' };
      }
      ids[o.optionId] = true;
    }
    if (kind == 'TRUE_FALSE' && (options.length != 2 || !ids['true'] || !ids['false'])) {
      return { problem: "true/false options must have the ids 'true' and 'false'" };
    }
    var correct = [];
    if (q.correctOptionIds) {
      q.correctOptionIds.each(function (id) {
        if (correct.indexOf(String(id)) < 0) {
          correct.push(String(id));
        }
      });
    }
    for (var j = 0; j < correct.length; j++) {
      if (!ids[correct[j]]) {
        return { problem: 'correct option ' + correct[j] + ' is not one of the options' };
      }
    }
    if (kind == 'MULTI_CHOICE' ? correct.length < 1 : correct.length != 1) {
      return { problem: kind == 'MULTI_CHOICE' ? 'needs at least one correct option' : 'needs exactly one correct option' };
    }
    fields.options = options.map(function (x) {
      return EduQuizOption.make(x);
    });
    fields.correctOptionIds = correct;
  } else if (kind == 'SHORT_ANSWER') {
    var accepted = [];
    if (q.acceptedAnswers) {
      q.acceptedAnswers.each(function (a) {
        var s = a != null ? String(a).trim() : '';
        if (s && accepted.indexOf(s) < 0) {
          accepted.push(s.length > MAX_LABEL ? s.substring(0, MAX_LABEL) : s);
        }
      });
    }
    if (!accepted.length) {
      return { problem: 'needs at least one accepted answer' };
    }
    if (accepted.length > MAX_ACCEPTED) {
      return { problem: 'has more than ' + MAX_ACCEPTED + ' accepted answers' };
    }
    fields.acceptedAnswers = accepted;
  } else {
    var starter = q.codeStarter != null ? String(q.codeStarter) : null;
    if (starter && starter.length > MAX_CODE_CHARS) {
      return { problem: 'the starter code is longer than ' + MAX_CODE_CHARS + ' characters' };
    }
    fields.codeStarter = starter;
  }
  return { problem: null, fields: fields };
}

/* ---- helpers --------------------------------------------------------------------------------------------------- */

function loadQuiz(quizId) {
  var quiz = EduQuiz.make({ id: quizId }).get('status, course.id');
  if (!quiz || !quiz.course) {
    throw new Error('EDU_NOT_FOUND: quiz ' + quizId);
  }
  return quiz;
}

function hasAttempts(quizId) {
  return EduQuizAttempt.fetchCount({ filter: Filter.eq('quiz.id', quizId) }) > 0;
}

function sortedQuestions(quizId, include) {
  var rows = [];
  EduQuizQuestion.fetchObjStream({ filter: Filter.eq('quiz.id', quizId), include: include }).each(function (q) {
    rows.push(q);
  });
  rows.sort(function (a, b) {
    var oa = a.questionOrder != null ? a.questionOrder : 0;
    var ob = b.questionOrder != null ? b.questionOrder : 0;
    return oa != ob ? oa - ob : String(a.id).localeCompare(String(b.id));
  });
  var out = EduQuizQuestion.arrayBuilder();
  rows.forEach(function (q) {
    out.add(q);
  });
  return out.build();
}

function nextOrder(quizId) {
  var last = EduQuizQuestion.fetch({
    filter: Filter.eq('quiz.id', quizId),
    include: 'questionOrder',
    order: 'descending(questionOrder)',
    limit: 1,
  }).objs.first();
  return last && last.questionOrder != null ? last.questionOrder + 1 : 1;
}
