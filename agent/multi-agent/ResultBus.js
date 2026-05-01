import { EventEmitter } from "node:events";

export class ResultBus {
  constructor() {
    this.tasks = new Map();
    this.events = new EventEmitter();
    this.events.setMaxListeners(100);
  }

  upsert(task) {
    if (!task?.taskId) {
      throw new Error("ResultBus.upsert: taskId is required");
    }
    const previous = this.tasks.get(task.taskId) || {};
    const next = {
      ...previous,
      ...task,
      updatedAt: Date.now(),
    };
    this.tasks.set(task.taskId, next);
    this.events.emit("update", next);
    this.events.emit(`task:${task.taskId}`, next);
    return next;
  }

  getTask(taskId) {
    return this.tasks.get(taskId) || null;
  }

  getTasksByParent(parentRequestId) {
    return [...this.tasks.values()]
      .filter((task) => task.parentRequestId === parentRequestId)
      .sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0));
  }

  subscribe(listener) {
    this.events.on("update", listener);
    return () => this.events.off("update", listener);
  }

  subscribeTask(taskId, listener) {
    const eventName = `task:${taskId}`;
    this.events.on(eventName, listener);
    return () => this.events.off(eventName, listener);
  }

  clearParent(parentRequestId) {
    for (const [taskId, task] of this.tasks.entries()) {
      if (task.parentRequestId === parentRequestId) {
        this.tasks.delete(taskId);
      }
    }
  }
}
