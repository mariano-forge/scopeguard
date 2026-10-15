"use client";

import Link from "next/link";
import { ArrowRight, Clock, MessageSquareText, PenLine, Repeat } from "lucide-react";

export type TodoKind = "changes-requested" | "adaptation" | "to-qualify" | "awaiting-client";

export type TodoItem = {
  key: string;
  kind: TodoKind;
  title: string;
  excerpt?: string;
  /** "Client / Projet / livrable V02" */
  context: string;
  meta?: string;
  href: string;
};

/** Agency actions first; "awaiting-client" is the list of things to chase. */
export const todoOrder: TodoKind[] = ["changes-requested", "adaptation", "to-qualify", "awaiting-client"];
export const isAgencyAction = (item: TodoItem) => item.kind !== "awaiting-client";

const icons = {
  "changes-requested": PenLine,
  adaptation: Repeat,
  "to-qualify": MessageSquareText,
  "awaiting-client": Clock,
};

export function TodoList({ items }: { items: TodoItem[] }) {
  return (
    <ul className="todo-list">
      {items.map((item) => {
        const Icon = icons[item.kind];
        return (
          <li key={item.key}>
            <Link className="todo-item" href={item.href}>
              <span className={`todo-icon todo-${item.kind}`} aria-hidden="true">
                <Icon />
              </span>
              <span className="todo-body">
                <span className="todo-title">
                  <b>{item.title}</b>
                  <small>{item.context}</small>
                </span>
                {item.excerpt && <span className="todo-excerpt">{item.excerpt}</span>}
                {item.meta && <small className="todo-meta">{item.meta}</small>}
              </span>
              <ArrowRight className="todo-arrow" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
