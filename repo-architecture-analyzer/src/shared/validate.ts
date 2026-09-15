import Ajv, { type ValidateFunction } from "ajv";
import schemaJson from "../../schema/repository-data.schema.json";
import narrativeSchemaJson from "../../schema/narrative.schema.json";
import type { RepositoryData, NarrativeContent } from "./types";

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

const narrativeAjv = new Ajv({ allErrors: true, strict: false });
const validateNarrativeFn: ValidateFunction = narrativeAjv.compile(narrativeSchemaJson);

export function validateNarrativeContent(data: unknown): ValidationResult {
  const valid = validateNarrativeFn(data);
  if (valid) {
    return { valid: true, errors: [] };
  }
  const errors = (validateNarrativeFn.errors ?? []).map(
    (e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`
  );
  return { valid: false, errors };
}

export function assertNarrativeContent(data: unknown): asserts data is NarrativeContent {
  const result = validateNarrativeContent(data);
  if (!result.valid) {
    throw new Error(`NarrativeContent failed schema validation:\n${result.errors.join("\n")}`);
  }
}
