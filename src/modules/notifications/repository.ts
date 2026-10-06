import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  notificationDeliveries,
  notificationPreferences,
  notifications,
} from "@/db/schema";
import type { TenantScope } from "@/lib/tenancy";

export async function listMembershipNotifications(
  db: Database,
  scope: TenantScope,
  membershipId: string,
) {
  return db
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, scope.organizationId),
        eq(
          notifications.organizationMembershipId,
          membershipId,
        ),
        eq(notifications.inAppVisible, true),
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(200);
}

export async function listMembershipNotificationPreferences(
  db: Database,
  scope: TenantScope,
  membershipId: string,
) {
  return db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(
          notificationPreferences.organizationId,
          scope.organizationId,
        ),
        eq(
          notificationPreferences.organizationMembershipId,
          membershipId,
        ),
      ),
    );
}

export async function listNotificationDeliveries(
  db: Database,
  scope: TenantScope,
) {
  return db
    .select()
    .from(notificationDeliveries)
    .where(
      eq(
        notificationDeliveries.organizationId,
        scope.organizationId,
      ),
    )
    .orderBy(desc(notificationDeliveries.createdAt))
    .limit(250);
}
