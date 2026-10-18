export const defaultRoute = "#/data";
export function resolveRoute(hash: string) {
  const route = !hash || hash === "#/" ? defaultRoute : hash;
  const paths = [
    ["#/data", "product"],
    ["#/portfolio", "portfolio"],
    ["#/tasks", "tasks"],
    ["#/paper", "paper"],
    ["#/execution", "execution"],
    ["#/market", "market"],
  ] as const;
  const match = paths.find(
    ([prefix]) => route === prefix || route.startsWith(prefix + "/"),
  );
  return { route, feature: match?.[1] ?? "not-found" };
}
