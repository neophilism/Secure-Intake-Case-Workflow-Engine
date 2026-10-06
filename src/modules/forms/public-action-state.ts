import type { ValidationError } from "./validation";

export interface PublicFormActionState {
  status: "idle" | "validation_error";
  errors: ValidationError[];
}

export const initialPublicFormActionState: PublicFormActionState = {
  status: "idle",
  errors: [],
};
