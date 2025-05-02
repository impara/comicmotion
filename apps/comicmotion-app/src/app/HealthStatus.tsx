"use client";
import { trpc } from '../utils/trpc';

export function HealthStatus() {
  const health = trpc.health.useQuery();
  return (
    <div className="mb-4 text-green-700">
      tRPC health: {health.data ?? 'loading...'}
    </div>
  );
} 