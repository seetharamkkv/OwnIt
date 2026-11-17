/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import axios, { AxiosRequestConfig } from 'axios';

/**
 * `x-request-envelope: true` tells the v8 REST dispatcher to read the body as a
 * `{ thisArg, args, kwargs }` envelope instead of a legacy positional array.
 */
const axiosConfig: AxiosRequestConfig = {
  headers: {
    'Content-Type': 'application/json',
    'x-request-envelope': 'true',
  },
};

export function getCookieValue(cookieName: string): string | undefined {
  const cookie = document?.cookie
    ?.split(';')
    ?.map((c) => c.trim())
    .find((c) => c.startsWith(cookieName + '='));
  return cookie ? cookie.split('=')[1] : undefined;
}

export function getAppBaseUrl(): string {
  const c3AppUrlPrefix = getCookieValue('c3AppUrlPrefix');
  const c3env = getCookieValue('c3env');
  const c3app = getCookieValue('c3app');

  let baseUrl = window.location.origin;
  if (c3AppUrlPrefix !== undefined) {
    baseUrl = `${baseUrl}/${c3AppUrlPrefix}`;
  } else if (c3env && c3app) {
    baseUrl = `${baseUrl}/${c3env}/${c3app}`;
  }

  return baseUrl.replace(/\/$/, '');
}

/**
 * Unified C3 API dispatch using the envelope body format.
 * Handles both static and member function calls via `{ thisArg, args, kwargs }`.
 *
 * - Static functions: pass `null` as `thisArg` (the type name is sent in its place).
 * - Member functions: pass the instance as `thisArg`, e.g. `{ id: '...' }`.
 * - Positional arguments go in `args` (always an array); named arguments go in `kwargs`.
 *
 * Errors are re-thrown as the original `Error` (an `AxiosError` for HTTP failures, so
 * `error.response.status` and `error.response.data` stay available). When the server
 * returns an error body with a `message`, that message replaces axios's generic
 * "Request failed with status code ..." text, so `error.message` always carries the real
 * cause. Handle errors with `reportError` from `useErrorBoundary`, or read `error.message`.
 *
 * @example
 * // Static: MyType.fetch({ limit: 10 }) returns { objs, count }
 * await c3Call('MyType', 'fetch', null, [{ limit: 10 }]);
 * // Member: MyType.make({ id: 'abc' }).get('this'), where the instance is the receiver
 * await c3Call('MyType', 'get', { id: 'abc' }, ['this']);
 * // Create: MyType.make({ name: 'New' }).create(), where the new object is the receiver
 * await c3Call('MyType', 'create', { name: 'New' });
 * // Merge with a spec: MyType.make({ id: 'abc', name: 'Renamed' }).merge({ include: 'this' })
 * await c3Call('MyType', 'merge', { id: 'abc', name: 'Renamed' }, [{ include: 'this' }]);
 *
 * @param typeName   The C3 type to call (e.g. 'MyType')
 * @param actionName The function to invoke (e.g. 'fetch')
 * @param thisArg    The instance for member functions, `null`/`undefined` for static functions
 * @param args       Positional arguments array (optional)
 * @param kwargs     Named arguments object (optional)
 * @returns Whatever the C3 function returns, or `null` for a 204 No Content response
 */
export async function c3Call(
  typeName: string,
  actionName: string,
  thisArg?: any,
  args?: any[],
  kwargs?: Record<string, any>
): Promise<any> {
  const appBaseUrl = getAppBaseUrl();
  const url = `${appBaseUrl}/api/8/${typeName}/${actionName}`;
  const envelope: Record<string, any> = {
    thisArg: thisArg ?? typeName,
    args: args ?? [],
  };
  if (kwargs && Object.keys(kwargs).length > 0) {
    envelope.kwargs = kwargs;
  }

  try {
    const response = await axios.post(url, JSON.stringify(envelope), {
      ...axiosConfig,
      validateStatus: (status) => status >= 200 && status < 300,
    });
    if (response.status === 204) {
      return null;
    }

    return response.data;
  } catch (error: unknown) {
    const serverMessage = axios.isAxiosError(error) ? (error.response?.data as any)?.message : undefined;
    if (typeof serverMessage === 'string' && serverMessage) {
      (error as Error).message = serverMessage;
    }

    throw error;
  }
}

export default c3Call;
