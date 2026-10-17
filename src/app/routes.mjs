export const defaultRoute = '#/portfolio/strategies';
export function resolveRoute(hash) {
  const route = !hash || hash === '#/' ? defaultRoute : hash;
  const paths = [
    ['#/portfolio', 'portfolio'], ['#/tasks', 'tasks'], ['#/paper', 'paper'],
    ['#/execution', 'execution'], ['#/market', 'market'],
  ];
  const match = paths.find(([prefix]) => route === prefix || route.startsWith(prefix + '/'));
  return { route, feature: match?.[1] ?? 'not-found' };
}
