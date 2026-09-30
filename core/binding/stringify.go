package binding

import (
	"bytes"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
)

// Stringify renders a resolved value as the bytes that go on the wire: a
// query value, a header value, a raw body, or one interpolated chunk of a
// template. It is a specified format, not "whatever
// json.Marshal happens to do", because this package and
// frontend/src/lib/refs.ts must render the same value identically — JSON with
// sorted keys and no HTML escaping, numbers per ECMA-262 Number::toString.
// core/testdata/binding_vectors.json pins both implementations.
func Stringify(v any) (string, error) {
	switch t := v.(type) {
	case nil:
		return "null", nil
	case string:
		return t, nil
	case bool:
		return strconv.FormatBool(t), nil
	case int:
		return strconv.Itoa(t), nil
	case int64:
		return strconv.FormatInt(t, 10), nil
	case float64:
		return jsNumber(t), nil
	default:
		return encodeJSON(t)
	}
}

// encodeJSON writes compact JSON with HTML escaping off: '<', '>' and '&' are
// ordinary body bytes here, not markup, and json.Marshal would rewrite them
// into <-style sequences that then travel over the wire.
func encodeJSON(v any) (string, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(jsNumbers(v)); err != nil {
		return "", fmt.Errorf("binding: cannot interpolate value of type %T: %w", v, err)
	}
	return strings.TrimSuffix(buf.String(), "\n"), nil
}

// jsNumbers rewrites every float64 leaf as a json.Number holding its jsNumber
// rendering, which the encoder then emits verbatim. Without it the encoder
// applies its own float format and {{res.small}} renders 1e-7 while {{res}}
// renders 0.0000001 for the same value. Non-finite floats pass through
// untouched so the encoder still rejects them as it always has.
func jsNumbers(v any) any {
	switch t := v.(type) {
	case float64:
		if math.IsNaN(t) || math.IsInf(t, 0) {
			return t
		}
		return json.Number(jsNumber(t))
	case map[string]any:
		out := make(map[string]any, len(t))
		for k, elem := range t {
			out[k] = jsNumbers(elem)
		}
		return out
	case []any:
		out := make([]any, len(t))
		for i, elem := range t {
			out[i] = jsNumbers(elem)
		}
		return out
	}
	return v
}

// Bounds of the decimal exponent for which ECMA-262 renders a number in fixed
// notation rather than exponential.
const (
	fixedExpMin = -6
	fixedExpMax = 21
)

// jsNumber renders v exactly as ECMAScript Number::toString does
// (ECMA-262 §6.1.6.1.20): shortest round-trip digits, fixed notation while
// the decimal exponent sits in (-6, 21], exponential outside it. Neither
// strconv verb matches: 'g' switches to exponential at 1e20 and zero-pads the
// exponent, 'f' never switches and renders 5e-324 as 324 digits.
func jsNumber(v float64) string {
	switch {
	case math.IsNaN(v):
		return "NaN"
	case math.IsInf(v, 1):
		return "Infinity"
	case math.IsInf(v, -1):
		return "-Infinity"
	case v == 0:
		return "0" // also covers -0, which JS renders as "0"
	}
	sign := ""
	if v < 0 {
		sign, v = "-", -v
	}
	// 'e' with precision -1 gives the shortest digits that round-trip.
	mant, exp10 := splitE(strconv.FormatFloat(v, 'e', -1, 64))
	digits := strings.Replace(mant, ".", "", 1)
	k := len(digits) // significant digits
	n := exp10 + 1   // value == 0.<digits> * 10^n
	switch {
	case k <= n && n <= fixedExpMax:
		return sign + digits + strings.Repeat("0", n-k)
	case 0 < n && n <= fixedExpMax:
		return sign + digits[:n] + "." + digits[n:]
	case fixedExpMin < n && n <= 0:
		return sign + "0." + strings.Repeat("0", -n) + digits
	}
	e := n - 1
	head := digits[:1]
	if k > 1 {
		head += "." + digits[1:]
	}
	if e >= 0 {
		return sign + head + "e+" + strconv.Itoa(e)
	}
	return sign + head + "e-" + strconv.Itoa(-e)
}

func splitE(s string) (mant string, exp int) {
	i := strings.IndexByte(s, 'e')
	exp, _ = strconv.Atoi(s[i+1:])
	return s[:i], exp
}
