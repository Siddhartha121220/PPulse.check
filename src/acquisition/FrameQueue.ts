/**
 * Frame Queue
 *
 * A pre-allocated ring buffer to queue frames or frame-derived data
 * from the high-speed worklet thread to the JS processing pipeline,
 * smoothing out processing spikes and preventing dropped frames.
 */

export class FrameQueue<T> {
  private buffer: (T | null)[];
  private capacity: number;
  private head = 0;
  private tail = 0;
  private size = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity).fill(null);
  }

  /**
   * Enqueue an item. If the queue is full, it drops the oldest item.
   */
  enqueue(item: T): void {
    if (this.size === this.capacity) {
      // Drop the oldest frame to make room (or we could just drop the new one)
      this.head = (this.head + 1) % this.capacity;
      this.size--;
    }

    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;
    this.size++;
  }

  /**
   * Dequeue an item. Returns null if empty.
   */
  dequeue(): T | null {
    if (this.size === 0) return null;

    const item = this.buffer[this.head];
    this.buffer[this.head] = null; // Help GC
    this.head = (this.head + 1) % this.capacity;
    this.size--;
    return item;
  }

  /**
   * Check if the queue is full.
   */
  isFull(): boolean {
    return this.size === this.capacity;
  }

  /**
   * Check if the queue is empty.
   */
  isEmpty(): boolean {
    return this.size === 0;
  }

  /**
   * Get the current size of the queue.
   */
  getSize(): number {
    return this.size;
  }

  /**
   * Reset the queue, dropping all items.
   */
  reset(): void {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
    this.buffer.fill(null);
  }
}
