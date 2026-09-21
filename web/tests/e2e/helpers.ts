import { expect, type Page } from '@playwright/test';
import type { AppState } from '../../src/domain/types';
export const key = 'morgan-el-pirata:home-prototype:v1';
export async function openDemo(page: Page) {
  await page.clock.install({ time: new Date('2026-09-16T14:00:00Z') });
  await page.goto('/?demo=1');
  await expect(page.getByRole('heading', { name: 'Today', exact: false }).first()).toBeVisible();
}
export async function quick(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: new RegExp('^' + name) }).click();
}
export async function saved(page: Page): Promise<AppState> {
  return page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)!), key);
}
export const section = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
