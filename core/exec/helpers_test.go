package exec

import (
	"context"

	"cascade/core"
	"cascade/core/httpcall"
	"cascade/core/nodespec"
	"cascade/core/transform"
)

// testOrigin lets every http fixture carry its own base, so no test needs an
// environment resolver to build a request.
const testOrigin = "http://engine.test"

// fakeTransport answers from a table keyed by request path and records what it
// was asked to send. Tests assert on the fully-built request rather than
// resolving bindings themselves, which is the point of moving request assembly
// into the engine.
type fakeTransport struct {
	sent      []httpcall.Request
	responses map[string]httpcall.Response
	// reply answers from the request itself, for loop bodies where the same
	// path is called once per iteration with different payloads.
	reply func(httpcall.Request) httpcall.Response
	err   error
}

func (f *fakeTransport) do(_ context.Context, req httpcall.Request, _ string) (httpcall.Response, error) {
	f.sent = append(f.sent, req)
	if f.err != nil {
		// A failing transport still reports what it attempted, so the
		// failure record can name the URL and the elapsed time.
		return httpcall.Response{URL: req.Path, DurationMs: 1}, f.err
	}
	resp, ok := f.responses[req.Path]
	if !ok && f.reply != nil {
		resp, ok = f.reply(req), true
	}
	if !ok {
		resp = httpcall.Response{Status: 200}
	}
	resp.URL = testOrigin + req.Path
	return resp, nil
}

func transportOf(responses map[string]httpcall.Response) *fakeTransport {
	return &fakeTransport{responses: responses}
}

func jsonResponse(status int, body any) httpcall.Response {
	return httpcall.Response{Status: status, Body: body}
}

// --- spec constructors -------------------------------------------------------

func httpSpec(key, method, path string, fields ...nodespec.Field) nodespec.Spec {
	return nodespec.Spec{Kind: core.NodeTypeHTTP, Key: key, HTTP: &nodespec.HTTPSpec{
		Method: method,
		Path:   path,
		Origin: testOrigin,
		Fields: fields,
	}}
}

func mockSpec(key string, status int, body string) nodespec.Spec {
	return nodespec.Spec{Kind: core.NodeTypeMock, Key: key, Mock: &nodespec.MockSpec{Status: status, Body: body}}
}

func transformScript(key, script string) nodespec.Spec {
	return nodespec.Spec{Kind: core.NodeTypeTransform, Key: key, Transform: &nodespec.TransformSpec{
		Mode: string(transform.ModeScript), Script: script,
	}}
}

func transformPick(key string, rows ...nodespec.Field) nodespec.Spec {
	return nodespec.Spec{Kind: core.NodeTypeTransform, Key: key, Transform: &nodespec.TransformSpec{
		Mode: string(transform.ModePick), Pick: rows,
	}}
}

func delaySpec(key string, ms int) nodespec.Spec {
	return nodespec.Spec{Kind: core.NodeTypeDelay, Key: key, Delay: &nodespec.DelaySpec{DurationMs: ms}}
}

func loopCount(key string, count int) nodespec.Spec {
	return nodespec.Spec{Kind: core.NodeTypeFor, Key: key, Loop: &nodespec.LoopSpec{
		Mode: nodespec.LoopModeCount, Count: count,
	}}
}

func loopEach(key, node, path string) nodespec.Spec {
	return nodespec.Spec{Kind: core.NodeTypeFor, Key: key, Loop: &nodespec.LoopSpec{
		Mode: nodespec.LoopModeEach, Source: &nodespec.Ref{NodeID: node, Path: path},
	}}
}

// --- field constructors ------------------------------------------------------

func literalField(key, value string) nodespec.Field {
	return nodespec.Field{Key: key, Source: nodespec.FieldLiteral, Value: value}
}

func templateField(key, template string) nodespec.Field {
	return nodespec.Field{Key: key, Source: nodespec.FieldTemplate, Value: template}
}

func refField(key, node, path string) nodespec.Field {
	return nodespec.Field{Key: key, Source: nodespec.FieldBinding, Ref: &nodespec.Ref{NodeID: node, Path: path}}
}
