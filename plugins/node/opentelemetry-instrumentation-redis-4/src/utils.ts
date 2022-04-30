import { DbStatementSerializer } from "./types";

export const defaultDbStatementSerializer: DbStatementSerializer = cmdName =>
  cmdName;

