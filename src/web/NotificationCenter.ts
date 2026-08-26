export interface NotificationEnvelope<T> {
  id: string;
  payload: T;
  priority?: number;
}

interface StoredNotification<T> extends NotificationEnvelope<T> {
  order: number;
}

export class PriorityNotificationQueue<T> {
  private entries: StoredNotification<T>[] = [];
  private order = 0;

  enqueue(notification: NotificationEnvelope<T>): void {
    const existing = this.entries.find((entry) => entry.id === notification.id);
    if (existing) {
      existing.payload = notification.payload;
      existing.priority = notification.priority;
      return;
    }
    this.entries.push({ ...notification, order: this.order++ });
  }

  take(): NotificationEnvelope<T> | undefined {
    this.entries.sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.order - right.order);
    const next = this.entries.shift();
    if (!next) return undefined;
    const { order: _order, ...notification } = next;
    return notification;
  }

  find(predicate: (payload: T) => boolean): T | undefined {
    return this.entries.find((entry) => predicate(entry.payload))?.payload;
  }

  get size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }
}
