import type { CaseTimelineItem } from "@/modules/timeline/repository";

export function CaseTimelinePanel({
  items,
}: {
  items: readonly CaseTimelineItem[];
}) {
  return (
    <section>
      <h2>Unified case timeline</h2>
      {items.length === 0 ? (
        <p>No timeline activity recorded.</p>
      ) : (
        <ol>
          {items.map((item) => (
            <li key={item.id}>
              <article>
                <p>
                  <strong>{item.kind}</strong> ·{" "}
                  {item.occurredAt.toISOString()}
                  {item.visibility
                    ? ` · ${item.visibility}`
                    : ""}
                </p>
                <p>{item.title}</p>
                {item.detail ? <p>{item.detail}</p> : null}
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
