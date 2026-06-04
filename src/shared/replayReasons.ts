import { shouldRecord, shouldReplay } from '../ruleMode';

/**
 * 判断是否处于 auto 模式（record 与 replay 同时开启）。
 */
export function isAutoMode(ruleValue: unknown): boolean {
  return shouldRecord(ruleValue) && shouldReplay(ruleValue);
}

/**
 * 根据模式生成 MISS 诊断原因。
 */
export function createReplayMissReason(ruleValue: unknown, reason?: string): string {
  const prefix = isAutoMode(ruleValue) ? 'AUTO MISS -> STORE' : 'REPLAY MISS -> PASS THROUGH';
  return reason && reason !== 'HIT' ? `${prefix}: ${reason}` : prefix;
}

/**
 * 根据模式生成 HIT 诊断原因。
 */
export function createReplayHitReason(ruleValue: unknown): string {
  return isAutoMode(ruleValue) ? 'AUTO HIT -> SKIP STORE' : 'REPLAY HIT';
}
