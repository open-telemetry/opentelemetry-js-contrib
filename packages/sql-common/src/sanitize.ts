/*
 * Copyright The OpenTelemetry Authors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * A SQL dialect the sanitizer knows how to lex. Required, with no default:
 * dialects disagree about which characters are data and which are structure, so
 * guessing either hides structure or leaks data.
 */
export type SqlDialect = 'postgresql';

export interface SanitizeSqlOptions {
  dialect: SqlDialect;
  /**
   * Maximum length of the returned statement. Scanning stops at the last whole
   * token that fits, so truncation never splits a literal or an identifier. A
   * limit small enough to exclude the first token yields an empty statement.
   *
   * Anything that is not a positive finite number falls back to the default.
   *
   * @default 32768
   */
  maxLength?: number;
}

/**
 * The string that replaces a literal value. `?` is the character the semantic
 * conventions use throughout their sanitization examples.
 */
const PLACEHOLDER = '?';

/**
 * A bound on the result, so that a statement with thousands of inlined rows
 * cannot put an unbounded string on a span. Callers may override it.
 */
const DEFAULT_MAX_LENGTH = 32 * 1024;

/**
 * Opening delimiter of a dollar-quoted string: `$$`, or `$tag$` for a tag
 * shaped like an unquoted identifier without the dollar signs. The same
 * delimiter closes the string.
 *
 * Sticky so it can be matched at an offset without re-slicing the statement. A
 * tag may hold any character PostgreSQL accepts in an identifier, including
 * every non-ASCII one;
 * recognizing a narrower set would emit the body of a string tagged with
 * anything else as ordinary tokens.
 */
const DOLLAR_QUOTE_DELIMITER =
  /\$([A-Za-z_\u0080-\uffff][A-Za-z0-9_\u0080-\uffff]*)?\$/y;

const NON_DECIMAL_PREFIX = /[xXoObB]/;
const NON_DECIMAL_DIGIT = /[0-9a-fA-F_]/;

/**
 * Keywords PostgreSQL's grammar never permits as a bare column or table
 * reference, even unquoted -- the "reserved" and "reserved (can be function
 * or type name)" categories of its keyword list. A value can never end on one
 * of these, unlike an ordinary identifier, which is what tells `SELECT -5`
 * (a sign) apart from `amount-5` (an operator on the column `amount`): both
 * are an identifier immediately followed by `-`, and only the keyword lookup
 * tells them apart.
 *
 * A non-reserved keyword (`LIMIT`, `OFFSET`, `RETURNING`, ...) is left out on
 * purpose: PostgreSQL still permits those as an ordinary identifier, so
 * treating one as never ending a value risks misreading an actual column of
 * that name. A sign directly after one of them is a known gap this leaves
 * unfixed.
 *
 * @see https://www.postgresql.org/docs/current/sql-keywords-appendix.html
 */
const RESERVED_KEYWORDS = new Set([
  'ALL',
  'AND',
  'ANY',
  'ARRAY',
  'AS',
  'ASYMMETRIC',
  'AUTHORIZATION',
  'BOTH',
  'CASE',
  'CAST',
  'CHECK',
  'COLLATE',
  'COLUMN',
  'CONCURRENTLY',
  'CONSTRAINT',
  'CROSS',
  'DEFAULT',
  'DISTINCT',
  'ELSE',
  'END',
  'FALSE',
  'FETCH',
  'FOR',
  'FOREIGN',
  'FREEZE',
  'FROM',
  'FULL',
  'GROUP',
  'HAVING',
  'ILIKE',
  'IN',
  'INITIALLY',
  'INNER',
  'INTERSECT',
  'INTO',
  'IS',
  'JOIN',
  'LATERAL',
  'LEFT',
  'LIKE',
  'NATURAL',
  'NOT',
  'NULL',
  'ONLY',
  'OR',
  'ORDER',
  'OUTER',
  'OVERLAPS',
  'PRIMARY',
  'REFERENCES',
  'RIGHT',
  'SELECT',
  'SIMILAR',
  'SOME',
  'SYMMETRIC',
  'TABLE',
  'TABLESAMPLE',
  'THEN',
  'TO',
  'TRAILING',
  'TRUE',
  'UNION',
  'UNIQUE',
  'USER',
  'USING',
  'VARIADIC',
  'VERBOSE',
  'WHEN',
  'WHERE',
  'WINDOW',
  'WITH',
]);

function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9';
}

/** PostgreSQL 16 and later permit underscores between a numeral's digits. */
function isDigitOrSeparator(ch: string | undefined): boolean {
  return isDigit(ch) || ch === '_';
}

function isWhitespace(ch: string): boolean {
  return (
    ch === ' ' ||
    ch === '\t' ||
    ch === '\n' ||
    ch === '\r' ||
    ch === '\f' ||
    ch === '\v'
  );
}

/**
 * Whether a character can begin an unquoted identifier. PostgreSQL admits every
 * non-ASCII character here, so this is a range rather than a list of letters.
 */
function isIdentifierStart(ch: string | undefined): boolean {
  return (
    ch !== undefined &&
    ((ch >= 'a' && ch <= 'z') ||
      (ch >= 'A' && ch <= 'Z') ||
      ch === '_' ||
      ch >= '\u0080')
  );
}

/**
 * Whether a character can continue an unquoted identifier. `$` counts, which is
 * what separates the identifier `a$1` from the placeholder `$1`.
 */
function isIdentifierChar(ch: string | undefined): boolean {
  return (
    ch !== undefined && (isIdentifierStart(ch) || isDigit(ch) || ch === '$')
  );
}

/**
 * Returns the index just past the digits of a numeric literal starting at
 * `start`, which must be a digit.
 */
function endOfDigits(sql: string, start: number): number {
  const n = sql.length;
  let i = start;

  // Hexadecimal, octal and binary integers.
  if (sql[i] === '0' && NON_DECIMAL_PREFIX.test(sql[i + 1] ?? '')) {
    i += 2;
    while (i < n && NON_DECIMAL_DIGIT.test(sql[i])) i++;
    return i;
  }

  while (i < n && isDigitOrSeparator(sql[i])) i++;

  if (sql[i] === '.') {
    i++;
    while (i < n && isDigitOrSeparator(sql[i])) i++;
  }

  // An exponent marker belongs to the number only when digits follow it;
  // otherwise it starts the next token.
  if (sql[i] === 'e' || sql[i] === 'E') {
    let j = i + 1;
    if (sql[j] === '+' || sql[j] === '-') j++;
    if (isDigit(sql[j])) {
      i = j;
      while (i < n && isDigitOrSeparator(sql[i])) i++;
    }
  }

  return i;
}

/**
 * Returns the index just past the numeric literal starting at `i`, or
 * undefined if no literal starts there.
 *
 * `valueEnded` says whether the last token emitted was one a value cannot
 * follow. That is what tells a sign apart from an operator: in `= -5` the minus
 * belongs to the number, in `amount-5` it does not. A decimal point binds
 * tightly instead, so `.5` is a number only when nothing at all is attached
 * directly in front of it.
 */
function endOfNumber(
  sql: string,
  i: number,
  prevIsIdentifierChar: boolean,
  valueEnded: boolean
): number | undefined {
  const ch = sql[i];

  if (ch === '-' || ch === '+') {
    if (valueEnded) return undefined;
    if (isDigit(sql[i + 1])) return endOfDigits(sql, i + 1);
    if (sql[i + 1] === '.' && isDigit(sql[i + 2])) {
      return endOfDigits(sql, i + 2);
    }
    return undefined;
  }

  if (prevIsIdentifierChar) return undefined;

  if (isDigit(ch)) return endOfDigits(sql, i);
  if (ch === '.' && isDigit(sql[i + 1])) return endOfDigits(sql, i + 1);

  return undefined;
}

/**
 * Returns the index just past a run delimited by `quote` whose contents begin
 * at `contentsAt`, or undefined if the delimiter is never closed. Doubling the
 * delimiter escapes it rather than ending the run, which is how PostgreSQL
 * spells a literal quote inside both strings and identifiers.
 */
function endOfDelimited(
  sql: string,
  contentsAt: number,
  quote: string,
  backslashEscapes: boolean
): number | undefined {
  const n = sql.length;
  let i = contentsAt;
  while (i < n) {
    if (backslashEscapes && sql[i] === '\\') {
      i += 2;
    } else if (sql[i] !== quote) {
      i++;
    } else if (sql[i + 1] === quote) {
      i += 2;
    } else {
      return i + 1;
    }
  }
  return undefined;
}

/**
 * Returns the index just past a single-quoted string starting at `i`, or
 * undefined if no string starts there. An unterminated string runs to the end
 * of the input, which is what keeps its contents out of the result.
 *
 * PostgreSQL allows prefixes in front of a string: `E` for backslash escapes,
 * `U&` for Unicode escapes, and `B`/`X` for bit and hexadecimal strings. A
 * prefix is only a prefix when the quote follows it immediately and nothing is
 * attached in front, so the `e` ending an identifier is never mistaken for an
 * escape-string marker.
 *
 * Only `E` gives a backslash meaning to the lexer. A `U&` string's Unicode
 * escapes are decoded after it has been lexed, so its backslashes are ordinary
 * characters when finding where it ends.
 */
function endOfStringLiteral(
  sql: string,
  i: number,
  prevIsIdentifierChar: boolean
): number | undefined {
  const n = sql.length;
  if (sql[i] === "'") return endOfDelimited(sql, i + 1, "'", false) ?? n;

  const next = sql[i + 1];
  if (next !== "'" && next !== '&') return undefined;
  if (prevIsIdentifierChar) return undefined;

  const prefix = sql[i].toUpperCase();
  if (next === "'") {
    if (prefix === 'E') return endOfDelimited(sql, i + 2, "'", true) ?? n;
    if (prefix === 'B' || prefix === 'X') {
      return endOfDelimited(sql, i + 2, "'", false) ?? n;
    }
    return undefined;
  }
  if (prefix === 'U' && sql[i + 2] === "'") {
    return endOfDelimited(sql, i + 3, "'", false) ?? n;
  }
  return undefined;
}

/**
 * Returns the index just past a block comment starting at `i`. Block comments
 * nest in PostgreSQL, so this counts depth rather than stopping at the first
 * closing delimiter.
 */
function endOfBlockComment(sql: string, i: number): number {
  const n = sql.length;
  let depth = 1;
  let j = i + 2;
  while (j < n && depth > 0) {
    if (sql[j] === '/' && sql[j + 1] === '*') {
      depth++;
      j += 2;
    } else if (sql[j] === '*' && sql[j + 1] === '/') {
      depth--;
      j += 2;
    } else {
      j++;
    }
  }
  return j;
}

function sanitizePostgresql(sql: string, maxLength: number): string {
  const n = sql.length;
  let out = '';
  let prev = '';
  let prevIsIdent = false;
  let valueEnded = false;
  let full = false;
  let i = 0;

  const append = (text: string) => {
    if (out.length + text.length > maxLength) {
      full = true;
      return;
    }
    out += text;
    prev = text.charAt(text.length - 1);
    prevIsIdent = isIdentifierChar(prev);
  };

  // Collapsing runs of whitespace keeps statements that differ only in layout
  // from looking like different statements. A dropped comment collapses the
  // same way, which is why this looks at what was last emitted rather than at
  // the input.
  const appendSpace = () => {
    if (out.length > 0 && prev !== ' ') append(' ');
  };

  // Every token is emitted whole or not at all, which is what makes truncation
  // safe: half a replaced literal never reaches the output. `endsValue` records
  // whether a value could follow this token, since the emitted text no longer
  // says -- a `?` may be either a replaced literal or a jsonb operator.
  const appendToken = (text: string, endsValue = true) => {
    append(text);
    valueEnded = endsValue;
  };

  while (i < n && !full) {
    const ch = sql[i];

    if (isWhitespace(ch)) {
      i++;
      appendSpace();
      continue;
    }

    // Comments are dropped rather than kept. A comment can hold a literal of
    // its own, and nothing distinguishes a benign one from a sensitive one.
    // A line comment ends at either newline character, as the server's lexer
    // has it.
    if (ch === '-' && sql[i + 1] === '-') {
      let j = i + 2;
      while (j < n && sql[j] !== '\n' && sql[j] !== '\r') j++;
      i = j;
      appendSpace();
      continue;
    }

    if (ch === '/' && sql[i + 1] === '*') {
      i = endOfBlockComment(sql, i);
      appendSpace();
      continue;
    }

    // Tried ahead of the identifier below, whose leading letter would otherwise
    // swallow the prefix of a string such as `E'...'`.
    const stringEnd = endOfStringLiteral(sql, i, prevIsIdent);
    if (stringEnd !== undefined) {
      i = stringEnd;
      appendToken(PLACEHOLDER);
      continue;
    }

    // An identifier is taken whole because `$` continues one, and PostgreSQL
    // resolves that overlap in favour of the longer token: `a$$b` is a single
    // identifier, not `a` followed by an empty dollar-quoted string.
    if (isIdentifierStart(ch)) {
      let j = i + 1;
      while (j < n && isIdentifierChar(sql[j])) j++;
      const text = sql.slice(i, j);
      appendToken(text, !RESERVED_KEYWORDS.has(text.toUpperCase()));
      i = j;
      continue;
    }

    if (ch === '$') {
      DOLLAR_QUOTE_DELIMITER.lastIndex = i;
      const delimiter = DOLLAR_QUOTE_DELIMITER.exec(sql)?.[0];
      if (delimiter !== undefined) {
        const end = sql.indexOf(delimiter, i + delimiter.length);
        i = end === -1 ? n : end + delimiter.length;
        appendToken(PLACEHOLDER);
        continue;
      }
      // `$1`, `$2`, ... stand in for values that travel separately and never
      // appear in the statement, so there is nothing here to replace.
      if (isDigit(sql[i + 1])) {
        let j = i + 1;
        while (j < n && isDigit(sql[j])) j++;
        appendToken(sql.slice(i, j));
        i = j;
        continue;
      }
      appendToken(ch);
      i++;
      continue;
    }

    // Double quotes delimit an identifier in PostgreSQL, so what they hold is a
    // table or column name and is kept. An unbalanced quote is the exception:
    // the remainder of the statement cannot be read as a name, so it is replaced
    // like any other construct that runs off the end of the input.
    if (ch === '"') {
      const end = endOfDelimited(sql, i + 1, '"', false);
      appendToken(end === undefined ? PLACEHOLDER : sql.slice(i, end));
      i = end ?? n;
      continue;
    }

    const numberEnd = endOfNumber(sql, i, prevIsIdent, valueEnded);
    if (numberEnd !== undefined) {
      i = numberEnd;
      appendToken(PLACEHOLDER);
      continue;
    }

    appendToken(ch, ch === ')' || ch === ']');
    i++;
  }

  return out.trim();
}

/**
 * Replaces the literal values in a SQL statement with `?`, so that the
 * statement can be recorded as `db.query.text` without carrying data with it.
 *
 * Parameter placeholders and identifiers -- including quoted ones -- are left
 * alone. Neither holds a value, and replacing them would cost the statement the
 * structure that makes it worth recording at all. Comments are removed, runs of
 * whitespace collapse to a single space, and the result is truncated at
 * `maxLength`.
 *
 * This is a lexer, not a parser: it finds where literals begin and end, and it
 * treats anything it cannot terminate as running to the end of the statement
 * rather than guessing.
 *
 * @param sql the statement to sanitize
 * @param options the dialect to lex as, and an optional length limit
 * @throws TypeError if `options.dialect` is not a supported dialect
 */
export function sanitizeSql(sql: string, options: SanitizeSqlOptions): string {
  if (options.dialect !== 'postgresql') {
    throw new TypeError(`unsupported SQL dialect: ${options.dialect}`);
  }
  // A limit that is not a positive finite number cannot bound anything: every
  // comparison against NaN is false, which would silently drop the limit
  // altogether rather than fall back to the default.
  const { maxLength } = options;
  const limit =
    typeof maxLength === 'number' && Number.isFinite(maxLength) && maxLength > 0
      ? maxLength
      : DEFAULT_MAX_LENGTH;
  return sanitizePostgresql(sql, limit);
}
