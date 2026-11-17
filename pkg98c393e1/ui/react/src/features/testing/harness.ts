/*
 * Python side of the browser test runner. Owner: Shreenidhi. Runs inside Pyodide (pyodide.worker.ts).
 * Kept in its own module so the same harness can be checked with CPython (see the comment at the end).
 *
 * Contract (PROJECT_PLAN.md 7.2): every top-level `def test_*()` in a test's code is collected and called, with the
 * student's program already executed in the same namespace. The program runs with __name__ == "student", so an
 * `if __name__ == "__main__":` block in the template does not run.
 */
export const HARNESS_PY = String.raw`
import ast
import io
import linecache
import sys
import time


def _edu_register(name, src):
    linecache.cache[name] = (len(src), None, src.splitlines(True), name)


def _edu_frame(exc):
    tb = exc.__traceback__
    found = None
    while tb is not None:
        if tb.tb_frame.f_code.co_filename in ("<student>", "<test>"):
            found = tb
        tb = tb.tb_next
    if found is None:
        return None, None, None
    name = found.tb_frame.f_code.co_filename
    line = linecache.getline(name, found.tb_lineno).strip()
    return name, found.tb_lineno, line


def _edu_message(exc):
    name, lineno, line = _edu_frame(exc)
    where = ""
    if name is not None:
        where = " (line %d of %s)" % (lineno, "your code" if name == "<student>" else "the test")
    if isinstance(exc, AssertionError):
        text = str(exc)
        if text:
            return text
        return ("Assertion failed: " + line) if line else "Assertion failed" + where
    if isinstance(exc, SystemExit):
        return "The code called exit()" + where
    return "%s: %s%s" % (type(exc).__name__, exc, where)


def _edu_test_names(test_code):
    tree = ast.parse(test_code)
    return [n.name for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name.startswith("test_")]


def _edu_result(test_id, name, passed, message, stdout, started):
    return {
        "testId": test_id,
        "testName": name,
        "passed": passed,
        "message": message,
        "stdout": stdout[:4000],
        "durationMs": int((time.perf_counter() - started) * 1000),
    }


def _edu_run_test(program, test_id, test_name, test_code):
    _edu_register("<student>", program)
    _edu_register("<test>", test_code)
    ns = {"__name__": "student"}
    out = io.StringIO()
    saved = (sys.stdout, sys.stderr)
    sys.stdout = sys.stderr = out
    started = time.perf_counter()
    try:
        try:
            code = compile(program, "<student>", "exec")
        except SyntaxError as e:
            return [_edu_result(test_id, test_name, False, "Your code has a syntax error on line %s: %s" % (e.lineno, e.msg), out.getvalue(), started)]
        try:
            exec(code, ns)
        except BaseException as e:
            return [_edu_result(test_id, test_name, False, "Your code stopped with an error before the test ran. " + _edu_message(e), out.getvalue(), started)]
        program_out = out.getvalue()

        try:
            names = _edu_test_names(test_code)
            exec(compile(test_code, "<test>", "exec"), ns)
        except BaseException as e:
            return [_edu_result(test_id, test_name, False, "The test could not be loaded (ask your instructor). " + _edu_message(e), program_out, started)]
        if not names:
            return [_edu_result(test_id, test_name, False, "This test has no def test_...() functions (ask your instructor).", program_out, started)]

        results = []
        for i, name in enumerate(names):
            out.seek(0)
            out.truncate(0)
            t0 = time.perf_counter()
            try:
                ns[name]()
                passed, message = True, None
            except BaseException as e:
                passed, message = False, _edu_message(e)
            stdout = (program_out if i == 0 else "") + out.getvalue()
            results.append(_edu_result(test_id, name, passed, message, stdout, t0))
        return results
    finally:
        sys.stdout, sys.stderr = saved


def _edu_run_cells(cells, upto):
    ns = {"__name__": "__main__"}
    outputs = []
    saved = (sys.stdout, sys.stderr)
    try:
        for index, src in enumerate(cells[: upto + 1]):
            name = "<cell %d>" % index
            _edu_register(name, src)
            out = io.StringIO()
            sys.stdout = sys.stderr = out
            error = None
            try:
                tree = ast.parse(src, name)
                last = tree.body[-1] if tree.body and isinstance(tree.body[-1], ast.Expr) else None
                if last is not None:
                    tree.body = tree.body[:-1]
                exec(compile(tree, name, "exec"), ns)
                if last is not None:
                    value = eval(compile(ast.Expression(last.value), name, "eval"), ns)
                    if value is not None:
                        print(repr(value))
            except BaseException as e:
                error = "%s: %s" % (type(e).__name__, e)
            outputs.append({"index": index, "stdout": out.getvalue()[:4000], "error": error})
            if error is not None:
                break
        return outputs
    finally:
        sys.stdout, sys.stderr = saved
`;

// To check the harness with CPython: paste HARNESS_PY into a file, then call
// _edu_run_test(program, "id", "name", test_code) and print the returned list.
