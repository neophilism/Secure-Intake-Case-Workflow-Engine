export type EntityId = string;

export type Visibility = "public" | "participant" | "internal" | "restricted";

export interface ActorRef {
  id: EntityId;
  type: "user" | "service";
  organizationId?: EntityId;
}

export interface ResourceRef {
  id: EntityId;
  type: string;
  organizationId?: EntityId;
}

export interface AuditEvent<TMetadata extends Record<string, unknown> = Record<string, unknown>> {
  id: EntityId;
  occurredAt: string;
  actor: ActorRef;
  action: string;
  resource: ResourceRef;
  correlationId?: string;
  metadata: TMetadata;
}
