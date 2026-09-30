// Test-request assembly: turns a library RequestDef draft
// into the fully-resolved TestRequest the SendTestRequest binding executes.
// Library defaults are literal-only, so no binding resolution happens here —
// just grouping the prefixed rows and validating what must be present.
import type { RequestDef, TestRequest } from './model'
import { isHttpMethod, type HttpMethod } from './model'
import { methodAllowsBody, pathPlaceholders, splitUrl } from './request'
import { setKeyPath } from './transform'

export type BuildTestRequestResult = { request: TestRequest } | { error: string }

/**
 * Builds the TestRequest for a request definition against the picked
 * environment/credential, or a human-readable reason it cannot be sent yet.
 */
export function buildTestRequest(
  request: RequestDef,
  envBaseUrl: string,
  credential: string,
): BuildTestRequestResult {
  // The ws stub never executes — reject before the wire.
  if (request.protocol !== 'http') {
    return { error: `${request.protocol} requests cannot be sent yet — only http executes` }
  }
  const method: HttpMethod = isHttpMethod(request.method) ? request.method : 'GET'
  const split = splitUrl(request.url)
  const path = split ? split.path : request.url.trim()
  if (!split && envBaseUrl.trim() === '') {
    return { error: 'the URL is relative — pick an environment to resolve it against' }
  }

  const pathParams: Record<string, string> = {}
  const query: Record<string, string> = {}
  const headers: Record<string, string> = {}
  const body: Record<string, unknown> = {}
  let hasBody = false
  for (const field of request.defaults ?? []) {
    const dot = field.key.indexOf('.')
    const prefix = field.key.slice(0, dot)
    const name = field.key.slice(dot + 1)
    if (prefix === 'path') pathParams[name] = field.value
    else if (prefix === 'query') query[name] = field.value
    else if (prefix === 'header') headers[name] = field.value
    else if (prefix === 'body') {
      setKeyPath(body, name, field.value)
      hasBody = true
    }
  }

  for (const name of pathPlaceholders(path)) {
    if (!pathParams[name]?.trim()) {
      return { error: `path parameter "${name}" needs a value — fill it in the Params section` }
    }
  }

  const built: TestRequest = { protocol: 'http', method, path }
  if (split) built.origin = split.origin
  else built.envBase = envBaseUrl.trim()
  if (Object.keys(pathParams).length > 0) built.pathParams = pathParams
  if (Object.keys(query).length > 0) built.query = query
  if (Object.keys(headers).length > 0) built.headers = headers
  // GET/HEAD never carry a body — drop it instead of failing.
  if (methodAllowsBody(method)) {
    // Raw mode (`rawBody !== undefined`, the editor's own mode switch)
    // replaces the field body outright: httpcall.Do rejects a request that
    // carries both.
    if (request.rawBody) built.rawBody = request.rawBody
    else if (hasBody) built.body = body
  }
  if (credential !== '') built.credential = credential
  return { request: built }
}
