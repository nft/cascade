package transform

import (
	_ "embed"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/dop251/goja"

	"cascade/core/binding"
)

// helpersJS defines the frozen `_` helper object (lodash feel, no
// dependency). It runs in every VM before the user script.
//
//go:embed helpers.js
var helpersJS string

// scriptFilename appears in script error positions ("transform.js:3:10").
const scriptFilename = "transform.js"

// Script globals: `res` (single-upstream output), `nodes` (ancestor outputs
// by key), `i` (iteration index), `_` (helpers).
const (
	globalRes   = "res"
	globalNodes = "nodes"
	globalIndex = "i"
)

var helpersProgram = goja.MustCompile("helpers.js", helpersJS, true)

// executeScript runs the user script in a fresh sandboxed VM. The sandbox is
// goja's default global — pure ECMAScript, no fetch/require/filesystem/timers
// (transforms must never be a second, unauditable HTTP path) — plus the
// injected inputs. A wall-clock timer interrupts runaway scripts.
func executeScript(script string, in Input) (any, error) {
	if strings.TrimSpace(script) == "" {
		return nil, errors.New("transform: script is empty")
	}
	// The wrapper makes top-level `return` legal. It adds no leading newline,
	// so reported line numbers match what the editor shows.
	prog, err := goja.Compile(scriptFilename, "(function(){"+script+"\n})()", true)
	if err != nil {
		return nil, fmt.Errorf("transform: %v", err)
	}

	vm := goja.New()
	if _, err := vm.RunProgram(helpersProgram); err != nil {
		return nil, fmt.Errorf("transform: install helpers: %v", err)
	}
	nodes := make(map[string]any, len(in.Nodes))
	for key, out := range in.Nodes {
		nodes[key] = outputJS(out)
	}
	if err := vm.Set(globalNodes, nodes); err != nil {
		return nil, fmt.Errorf("transform: %v", err)
	}
	if in.Res != nil {
		if err := vm.Set(globalRes, outputJS(in.Res)); err != nil {
			return nil, fmt.Errorf("transform: %v", err)
		}
	}
	if err := vm.Set(globalIndex, in.Index); err != nil {
		return nil, fmt.Errorf("transform: %v", err)
	}

	timeout := in.Timeout
	if timeout <= 0 {
		timeout = DefaultTimeout
	}
	timer := time.AfterFunc(timeout, func() { vm.Interrupt("wall-clock limit") })
	defer timer.Stop()

	value, err := vm.RunProgram(prog)
	if err != nil {
		var interrupted *goja.InterruptedError
		if errors.As(err, &interrupted) {
			return nil, fmt.Errorf("transform: script exceeded the %v time limit", timeout)
		}
		var exception *goja.Exception
		if errors.As(err, &exception) {
			return nil, fmt.Errorf("transform: script threw: %v", exception)
		}
		return nil, fmt.Errorf("transform: %v", err)
	}
	if value == nil || goja.IsUndefined(value) {
		return nil, errors.New("transform: script returned no value — end it with `return …`")
	}
	return value.Export(), nil
}

// outputJS is the script-facing shape of one upstream output:
// {status, headers, body}, matching the accessor names rows use.
func outputJS(out *binding.Output) map[string]any {
	headers := make(map[string]any, len(out.Header))
	for name := range out.Header {
		headers[name] = out.Header.Get(name)
	}
	return map[string]any{
		"status":  out.Status,
		"headers": headers,
		"body":    out.Body,
	}
}
