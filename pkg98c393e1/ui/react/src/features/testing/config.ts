/*
 * Test runner settings. Owner: Shreenidhi. PROJECT_PLAN.md 11.2.
 *
 * Pyodide is pinned to 0.27.8 (Python 3.12.7, pandas 2.2.3), matching the server's Python 3.12 / pandas 2.2.3.
 * PYODIDE_INDEX_URL is the one place that says where it loads from. It is the jsDelivr CDN for now (reachable from
 * this workspace, and the template sets no content security policy). If a deployment's CSP blocks the CDN, unpack
 * pyodide-0.27.8.tar.bz2 into ui/react/public/pyodide/ and point this at that folder instead.
 */
export const PYODIDE_VERSION = '0.27.8';
export const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

/** Default per-test time limit when EduStepTest.timeoutMs is unset. */
export const DEFAULT_TEST_TIMEOUT_MS = 5000;

/** Time allowed to load Pyodide plus packages (pandas is ~10 MB) on the first run. */
export const PREPARE_TIMEOUT_MS = 120_000;
