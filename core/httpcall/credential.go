// Credential injection (plan 04): a credential is a named secret string plus
// an injection rule describing where that string enters the request. "Send
// custom header X-Internal-Token: <secret>" is configuration, not a new type.
package httpcall

import (
	"encoding/base64"
	"fmt"
	"strings"
)

// Credential kinds — the full injection matrix.
const (
	KindBearer = "bearer" // Authorization: Bearer {secret}
	KindBasic  = "basic"  // Authorization: Basic base64(username:secret)
	KindHeader = "header" // <Header>: template with {secret} substituted
	KindQuery  = "query"  // ?<param>=<secret> appended to the URL
)

// SecretPlaceholder marks where the secret lands in a value template.
const SecretPlaceholder = "{secret}"

// DefaultTemplate is the effective template when a credential carries none.
const DefaultTemplate = SecretPlaceholder

const headerAuthorization = "Authorization"

// Credential is a fully-resolved injection: the persisted metadata plus the
// secret value the caller's resolver looked up at run time. It never persists.
type Credential struct {
	Kind     string
	Header   string // kind header: the header name, e.g. X-Internal-Token
	Param    string // kind query: the query parameter name
	Template string // optional value template; "" means DefaultTemplate
	Secret   string
	Username string // kind basic only; Secret is the password
}

// ValidKind reports whether kind names one of the injection rules.
func ValidKind(kind string) bool {
	switch kind {
	case KindBearer, KindBasic, KindHeader, KindQuery:
		return true
	}
	return false
}

// ValidateTemplate accepts "" (meaning DefaultTemplate) or a template with
// exactly one {secret} placeholder — zero would silently drop the secret,
// more than one would repeat it.
func ValidateTemplate(template string) error {
	if template == "" {
		return nil
	}
	if strings.Count(template, SecretPlaceholder) != 1 {
		return fmt.Errorf("template %q must contain %s exactly once", template, SecretPlaceholder)
	}
	return nil
}

// injection is a credential resolved to its concrete effect on one request:
// a header to set, or a query parameter to append to the built URL.
type injection struct {
	header string
	param  string
	value  string
}

// resolve turns the credential into its injection, validating the shape.
func (c *Credential) resolve() (injection, error) {
	if c.Secret == "" {
		return injection{}, fmt.Errorf("credential has no secret value")
	}
	if err := ValidateTemplate(c.Template); err != nil {
		return injection{}, err
	}
	template := c.Template
	if template == "" {
		template = DefaultTemplate
	}
	value := strings.Replace(template, SecretPlaceholder, c.Secret, 1)

	switch c.Kind {
	case KindBearer:
		return injection{header: headerAuthorization, value: "Bearer " + c.Secret}, nil
	case KindBasic:
		token := base64.StdEncoding.EncodeToString([]byte(c.Username + ":" + c.Secret))
		return injection{header: headerAuthorization, value: "Basic " + token}, nil
	case KindHeader:
		if c.Header == "" {
			return injection{}, fmt.Errorf("credential of kind %q has no header name", KindHeader)
		}
		return injection{header: c.Header, value: value}, nil
	case KindQuery:
		if c.Param == "" {
			return injection{}, fmt.Errorf("credential of kind %q has no query parameter name", KindQuery)
		}
		return injection{param: c.Param, value: value}, nil
	}
	return injection{}, fmt.Errorf("unknown credential kind %q", c.Kind)
}
