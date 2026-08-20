import Ajv, { type ValidateFunction } from "ajv";
import schemaJson from "../../schema/repository-data.schema.json";
import type { RepositoryData } from "./types";

const ajv = new Ajv({ allErrors: true, strict: false });
const validateFn: ValidateFunction = ajv.compile(schemaJson);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateRepositoryData(data: unknown): ValidationResult {
  const valid = validateFn(data);
  if (valid) {
    return { valid: true, errors: [] };
  }
  const errors = (validateFn.errors ?? []).map(
    (e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`
  );
  return { valid: false, errors };
}

export function assertRepositoryData(data: unknown): asserts data is RepositoryData {
  const result = validateRepositoryData(data);
  if (!result.valid) {
    throw new Error(`RepositoryData failed schema validation:\n${result.errors.join("\n")}`);
  }
}
