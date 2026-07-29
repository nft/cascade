package exec

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"cascade/core"
	"cascade/core/binding"
	"cascade/core/httpcall"
	"cascade/core/nodespec"
)

// Transport performs one fully-resolved call. The engine never sees a secret:
// it hands over the credential NAME and the app layer's closure resolves it.
// Tests inject an httptest-backed transport.
//
// A transport that fails MUST still return whatever it managed to determine:
// httpcall.Response.URL (redacted) and SentHeaders are known before the call,
// and DurationMs is measurable across it. A connection-refused log row with no
// URL and no elapsed time is close to useless. Status stays 0.
type Transport func(ctx context.Context, req httpcall.Request, credential string) (httpcall.Response, error)

// EnvBaseFunc maps an environment name to its base URL. An unknown name is an
// error, which fails only the node that names it. Callers must pass this
// through to BuildRequest rather than pre-resolving it, so a node that
// overrides its origin never needs an environment at all.
type EnvBaseFunc = nodespec.BaseURLFunc

// HTTPFailureStatus is the response status at or above which a completed call
// still fails its node: a 4xx/5xx create must not let a dependent read run
// against a phantom id. httpcall.Do returns no error for a 422, so the rule
// lives here.
const HTTPFailureStatus = 400

// CallDetail is everything a run-log row needs about one http call, and the
// data that cannot travel through binding.Output.
type CallDetail struct {
	Method      string
	URL         string // as sent, query-kind credential values redacted
	RequestBody string // the resolved payload, raw text or marshaled JSON
	SentHeaders map[string]string
	// Status is 0 when the call never reached a server; the bridge renders
	// that as an absent status rather than a zero one.
	Status       int
	StatusText   string
	ResponseBody string
	Truncated    bool
	DurationMs   int
}

// runHTTP builds, sends and captures one http node's call. It returns the
// CallDetail on every path that reached the transport — including failures —
// so a connection refusal still produces a log row naming the URL it tried.
func (r *runner) runHTTP(ctx context.Context, node core.Node, env *binding.Env) (*binding.Output, *CallDetail, error) {
	spec, ok := r.spec(node.ID)
	if !ok || spec.HTTP == nil {
		return nil, nil, fmt.Errorf("exec: http node %q has no spec", node.ID)
	}
	if r.opts.Transport == nil {
		return nil, nil, fmt.Errorf("exec: no transport configured for node %q", node.ID)
	}
	req, err := spec.HTTP.BuildRequest(env, r.opts.EnvBase)
	if err != nil {
		// Nothing was attempted, so there is no call to describe.
		return nil, nil, err
	}
	resp, err := r.opts.Transport(ctx, req, spec.HTTP.Credential)
	detail := callDetail(req, resp)
	if err != nil {
		return nil, detail, err
	}
	if resp.Status >= HTTPFailureStatus {
		return nil, detail, fmt.Errorf("%d %s", resp.Status, http.StatusText(resp.Status))
	}
	return outputOf(resp), detail, nil
}

func callDetail(req httpcall.Request, resp httpcall.Response) *CallDetail {
	return &CallDetail{
		Method:       req.Method,
		URL:          resp.URL,
		RequestBody:  requestBodyText(req),
		SentHeaders:  resp.SentHeaders,
		Status:       resp.Status,
		StatusText:   http.StatusText(resp.Status),
		ResponseBody: resp.BodyText,
		Truncated:    resp.Truncated,
		DurationMs:   resp.DurationMs,
	}
}

// requestBodyText renders the payload exactly as httpcall.Do will send it.
// Fields-mode literals are JSON strings with no coercion, so `body.amount =
// 100` goes out as {"amount":"100"} — showing the bytes is what makes the
// first 422 explicable.
func requestBodyText(req httpcall.Request) string {
	if req.RawBody != nil {
		return req.RawBody.Text
	}
	if req.Body == nil {
		return ""
	}
	raw, err := json.Marshal(req.Body)
	if err != nil {
		return ""
	}
	return string(raw)
}

// outputOf converts a captured response into the value downstream nodes bind
// against. The header map is rebuilt through http.Header.Set so canonical
// lookups work: binding resolves `headers.Location` through Header.Get, which
// canonicalizes the name it is given.
func outputOf(resp httpcall.Response) *binding.Output {
	header := make(http.Header, len(resp.Headers))
	for name, value := range resp.Headers {
		header.Set(name, value)
	}
	return &binding.Output{
		Status: resp.Status,
		Header: header,
		Body:   resp.Body,
		// The only place in Go that can know a body was dropped for exceeding
		// the capture cap: every other Output is built from a body computed in
		// process. Without this an over-cap response reports "value is a JSON
		// null and has no sub-fields" instead of naming the cap.
		Truncated: resp.Truncated,
	}
}
