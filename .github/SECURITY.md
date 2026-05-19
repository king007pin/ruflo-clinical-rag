# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest (main) | Yes |
| Older branches | No |

## Reporting a Vulnerability

**Do not report security vulnerabilities via public GitHub issues.**

Mediq handles sensitive health-related data. We take security seriously.

### How to Report

**Preferred:** Use [GitHub Private Vulnerability Reporting](https://github.com/king007pin/Mediq/security/advisories/new)

**Alternative:** Email **sh007shubham@gmail.com** with subject line:
```
[SECURITY] <brief description>
```

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact / affected data
- Suggested fix (optional)
- Your contact info (for follow-up)

## Response Timeline

| Stage | Target |
|-------|--------|
| Acknowledgment | 48 hours |
| Initial assessment | 5 business days |
| Fix or mitigation | 30 days (critical: 7 days) |
| Public disclosure | After fix is deployed |

We follow responsible disclosure. You will be credited in the advisory unless you prefer to remain anonymous.

## Scope

### In Scope

- Authentication and authorization bypasses
- SQL injection / NoSQL injection
- Data exposure (patient/user PII or PHI)
- Cross-site scripting (XSS)
- Cross-site request forgery (CSRF)
- Insecure direct object references (IDOR)
- Secrets or credentials exposed in code/logs
- Dependency vulnerabilities with known exploits (CVSS >= 7.0)
- Broken access control between user roles

### Out of Scope

- Denial of service (DoS/DDoS)
- Social engineering attacks
- Physical attacks
- Issues in unsupported/deprecated branches
- Missing security headers without demonstrated impact
- Rate limiting without demonstrated data exposure
- Vulnerabilities requiring physical device access

## Safe Harbor

We will not pursue legal action against researchers who:

1. Report vulnerabilities through the channels above
2. Do not access, modify, or exfiltrate real user data
3. Do not disrupt service availability
4. Give us reasonable time to fix before public disclosure

## Security Best Practices

If you are deploying this project:

- Rotate all credentials from `.env.example` before deployment
- Never commit `.env` files -- use secrets management
- Enable GitHub Dependabot alerts on your fork
- Use parameterized queries -- never interpolate user input into SQL
- Ensure database roles follow least-privilege principles
