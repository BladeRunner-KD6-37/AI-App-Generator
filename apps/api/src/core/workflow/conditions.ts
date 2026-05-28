type ConditionData = Record<string, unknown>;

function getDataValue(path: string, data: ConditionData): unknown {
  if (path === "data") {
    return data;
  }

  if (!path.startsWith("data.")) {
    throw new Error(`Unsupported left-hand operand: ${path}`);
  }

  const keys = path.slice(5).split(".");
  let current: unknown = data;

  for (const key of keys) {
    if (current === null || typeof current !== "object") {
      return undefined;
    }

    current = (current as ConditionData)[key];
  }

  return current;
}

function parseLiteral(token: string): unknown {
  const trimmed = token.trim();

  if (trimmed === "true") {
    return true;
  }

  if (trimmed === "false") {
    return false;
  }

  if (trimmed === "null") {
    return null;
  }

  const numberValue = Number(trimmed);
  if (!Number.isNaN(numberValue) && trimmed !== "") {
    return numberValue;
  }

  const singleQuoteString = /^'(.*)'$/s;
  const doubleQuoteString = /^"(.*)"$/s;

  if (singleQuoteString.test(trimmed)) {
    const inner = trimmed.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    return inner;
  }

  if (doubleQuoteString.test(trimmed)) {
    try {
      return JSON.parse(trimmed);
    } catch {
      const inner = trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      return inner;
    }
  }

  throw new Error(`Unsupported literal or operand: ${token}`);
}

function resolveOperand(token: string, data: ConditionData): unknown {
  const trimmed = token.trim();
  if (trimmed.startsWith("data")) {
    return getDataValue(trimmed, data);
  }

  return parseLiteral(trimmed);
}

function compareValues(operator: string, left: unknown, right: unknown): boolean {
  switch (operator) {
    case "===":
      return left === right;
    case "!==":
      return left !== right;
    case ">":
      return typeof left === "number" && typeof right === "number" && left > right;
    case "<":
      return typeof left === "number" && typeof right === "number" && left < right;
    case ">=":
      return typeof left === "number" && typeof right === "number" && left >= right;
    case "<=":
      return typeof left === "number" && typeof right === "number" && left <= right;
    case "=":
      return left === right;
    default:
      throw new Error(`Unsupported operator: ${operator}`);
  }
}

const operatorPattern = /(===|!==|>=|<=|>|<|=)/;

export function evaluateCondition(condition: string, data: ConditionData): boolean {
  const expression = condition.trim();
  const operatorMatch = expression.match(operatorPattern);

  if (!operatorMatch) {
    throw new Error(`Invalid condition expression: ${condition}`);
  }

  const operator = operatorMatch[0];
  const [left, right] = expression.split(operator).map((part) => part.trim());

  if (!left || !right) {
    throw new Error(`Invalid condition expression: ${condition}`);
  }

  const leftValue = resolveOperand(left, data);
  const rightValue = resolveOperand(right, data);

  return compareValues(operator, leftValue, rightValue);
}
