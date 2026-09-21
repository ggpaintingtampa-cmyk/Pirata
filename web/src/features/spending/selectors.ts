import type { BusinessSnapshot, Expense } from '@pirata/contracts/index';
export const expenseOrder = (a: Expense, b: Expense) => b.createdAt - a.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export function filteredExpenses(snapshot: BusinessSnapshot, date = '', project = '*'): Expense[] {
  return snapshot.expenses.filter(e => (!date || e.purchaseDate === date) && (project === '*' || e.projectId === (project || null))).sort(expenseOrder);
}
export const latestExpenses = (snapshot: BusinessSnapshot, date: string) => filteredExpenses(snapshot, date).slice(0, 3);
export function totalCents(expenses: Expense[]): number {
  const total = expenses.reduce((sum, expense) => sum + BigInt(expense.amountCents), 0n);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError('The total exceeds the supported safe amount. Narrow the filters.');
  return Number(total);
}
