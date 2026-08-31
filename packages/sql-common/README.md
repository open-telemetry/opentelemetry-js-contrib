# Common Utils for OpenTelemetry SQL packages

This is an internal utils package used for the different SQL instrumentations:

1. mysql2
2. pg

## Exports

- `buildTraceparent(span)` — the W3C `traceparent` string for a span.
- `addSqlCommenterComment(span, query)` — appends a
  [sqlcommenter](https://google.github.io/sqlcommenter/spec/) comment to a query.
- `sanitizeSql(sql, { dialect, maxLength })` — replaces the literals in a SQL
  statement with `?`, for use as `db.query.text`.

### `sanitizeSql`

A single-pass, dependency-free lexer. It replaces string, numeric, bit-string
and dollar-quoted literals with `?`, drops `--` and (nestable) `/* */` comments,
collapses runs of whitespace, and preserves identifiers — including `"quoted"`
ones — and `$n` parameter placeholders. Output is truncated at `maxLength`
(default 32768) at a token boundary, so a replaced value is never cut in half.

PostgreSQL spells some operators with a question mark as well — `?`, `?|` and
`?&` on jsonb among them — so a `?` in the output does not on its own mean a
value was replaced there. The semantic conventions fix the placeholder character,
and an operator is recoverable from the statement around it in a way a value is
not.

`dialect` is required and only `'postgresql'` is implemented. There is no
default because the rules differ in ways that decide whether characters are
data or structure: in PostgreSQL `"..."` is an identifier, while in MySQL's
default `sql_mode` it is a string literal.

`IN (...)` lists are deliberately not collapsed to `IN (?)`. Once the literals
are replaced the list carries no data, collapsing hides pathologically large
lists, and the only consumers that would benefit are ones that do not exist
yet.
