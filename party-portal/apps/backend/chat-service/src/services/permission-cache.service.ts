// src/services/permission-cache.service.ts
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PermissionCacheService {
  private cache = new Map<
    string,
    {
      value: boolean;
      timeoutId: NodeJS.Timeout;
      expiresAt: number; // Store exact expiry timestamp
    }
  >();
  private readonly MAX_CACHE_SIZE = 1000;
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private readonly logger: Logger) {}

  get(key: string): boolean | undefined {
    const entry = this.cache.get(key);
    return entry?.value;
  }

  set(key: string, value: boolean): void {
    const existingEntry = this.cache.get(key); // Get existing entry first

    // Clear existing timeout if key exists
    if (existingEntry) {
      clearTimeout(existingEntry.timeoutId); // Use the fetched entry
    }
    // Check if we need to evict when at capacity and it's a new key
    else if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.evictOldest();
    }

    const expiresAt = Date.now() + this.TTL;

    // Set timeout for deletion
    const timeoutId = setTimeout(() => {
      this.delete(key); // Use the key directly
    }, this.TTL);

    // Store value with metadata
    this.cache.set(key, {
      value,
      timeoutId,
      expiresAt,
    });
  }

  delete(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      clearTimeout(entry.timeoutId);
      this.cache.delete(key);
    }
  }

  clear(): void {
    // Clear all timeouts
    for (const entry of this.cache.values()) {
      clearTimeout(entry.timeoutId);
    }
    this.cache.clear();
  }

  // Evict oldest entry based on expiration time
  private evictOldest(): void {
    if (this.cache.size === 0) return;

    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    // Find the entry closest to expiration
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < oldestTime) {
        oldestTime = entry.expiresAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.delete(oldestKey);
      this.logger.debug(`Evicted oldest cache entry: ${oldestKey}`);
    }
  }

  get size(): number {
    return this.cache.size;
  }
}
