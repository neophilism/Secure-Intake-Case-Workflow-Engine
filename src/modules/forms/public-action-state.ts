import type { ValidationError } from "./validation";

export interface PublicFormActionState {
  status: "idle" | "validation_error" | "submitted";
  errors: ValidationError[];
  confirmationCode?: string;
  participantPortal?: {
    trackingCode: string;
    accessSecret: string;
    loginPath: string;
  } | null;
}

export const initialPublicFormActionState: PublicFormActionState = {
  status: "idle",
  errors: [],
  participantPortal: null,
};
