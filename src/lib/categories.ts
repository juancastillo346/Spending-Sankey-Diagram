export const CATEGORY_PALETTE = [
  "#3498db", "#e67e22", "#2ecc71", "#e74c3c", "#9b59b6",
  "#a0522d", "#f39c12", "#1abc9c", "#e91e63", "#00bcd4",
];

export function getCategoryColorMap(categories: string[]): Map<string, string> {
  const sorted = [...categories].sort();
  const map = new Map<string, string>();
  sorted.forEach((c, i) => map.set(c, CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]));
  return map;
}

export function formatCategoryLabel(s: string): string {
  if (!s) return s;
  return s
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export const DEFAULT_CATEGORIES: string[] = [
  "Food & Dining",
  "Groceries",
  "Coffee",
  "Shopping",
  "Bills & Utilities",
  "Rent/Mortgage",
  "Travel",
  "Transportation",
  "Gas",
  "Entertainment",
  "Health & Fitness",
  "Medical",
  "Education",
  "Gifts & Donations",
  "Personal Care",
  "Subscriptions",
  "Home",
  "Kids",
  "Pets",
  "Taxes",
  "Fees",
  "Other",
];

