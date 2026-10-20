const PUBLIC_ROUTES: { method?: string; prefix: string }[] = [
  { method: 'POST', prefix: '/auth/login' },
  { method: 'POST', prefix: '/auth/forgot-password' },
  { prefix: '/public/profiles' },
  { prefix: '/public/payments' },
  { method: 'POST', prefix: '/public/payment-gateway/mellat/callback' },
  { method: 'GET', prefix: '/images' },
];

const AUTH_ONLY_PREFIXES = ['/auth', '/account', '/images'];

const LOOKUP_COLLECTIONS = new Set([
  '/countries',
  '/provinces',
  '/cities',
  '/bank-accounts',
  '/municipal-fees',
  '/discounts',
  '/job-types',
  '/inquiry-centers',
  '/job-groups',
  '/jobs',
  '/registration-places',
  '/documents',
  '/work-units',
  '/staff-posts',
  '/violation-types',
  '/roles',
  '/users',
  '/organization/positions',
  '/organization/unit-kinds',
  '/organization/units',
  '/commercial-complexes',
]);

type RoutePermission = {
  prefix: string;
  permissions: string[];
};

const ROUTE_PERMISSIONS: RoutePermission[] = [
  {
    prefix: '/cases/inquiries/report',
    permissions: ['cases.inquiries', 'reports.inquiry-centers'],
  },
  { prefix: '/cases/inquiries', permissions: ['cases.inquiries', 'cases.formation'] },
  {
    prefix: '/cases/places/report',
    permissions: ['cases.places', 'reports.places-cases'],
  },
  { prefix: '/cases/places', permissions: ['cases.places', 'cases.formation'] },
  {
    prefix: '/cases/management-reviews/report',
    permissions: ['cases.management-reviews', 'reports.referred-cases'],
  },
  {
    prefix: '/cases/management-reviews',
    permissions: ['cases.management-reviews', 'cases.formation', 'cases.management'],
  },
  { prefix: '/cases/issuance', permissions: ['cases.issuance'] },
  { prefix: '/cases/settings', permissions: ['cases.settings', 'base-info.letter-settings'] },
  { prefix: '/cases/reports/expiring', permissions: ['reports.expiring-cases', 'reports'] },
  { prefix: '/cases/reports', permissions: ['reports.case-files', 'reports'] },
  { prefix: '/cases/formation', permissions: ['cases.formation'] },
  { prefix: '/cases', permissions: ['cases.management'] },
  { prefix: '/roles', permissions: ['management.roles'] },
  { prefix: '/case-expiry', permissions: ['management.case-expiry'] },
  { prefix: '/scheduled-jobs', permissions: ['management.schedules'] },
  { prefix: '/countries', permissions: ['base-info.countries'] },
  { prefix: '/provinces', permissions: ['base-info.provinces'] },
  { prefix: '/cities', permissions: ['base-info.cities'] },
  {
    prefix: '/commercial-complexes',
    permissions: ['base-info.commercial-complexes'],
  },
  { prefix: '/bank-accounts', permissions: ['finance.bank-accounts'] },
  { prefix: '/municipal-fees', permissions: ['finance.municipal-fees'] },
  { prefix: '/discounts', permissions: ['finance.discounts'] },
  { prefix: '/financial-settings', permissions: ['finance.settings'] },
  {
    prefix: '/case-finance',
    permissions: ['cases.management', 'cases.formation', 'finance.payments'],
  },
  {
    prefix: '/payment-groups',
    permissions: ['finance.payments', 'finance.payment-history'],
  },
  { prefix: '/payment-history', permissions: ['finance.payment-history'] },
  { prefix: '/payments', permissions: ['finance.payments'] },
  { prefix: '/job-types', permissions: ['base-info.job-types'] },
  { prefix: '/inquiry-centers', permissions: ['base-info.inquiry-centers'] },
  { prefix: '/job-groups', permissions: ['base-info.job-groups'] },
  { prefix: '/jobs', permissions: ['base-info.jobs'] },
  {
    prefix: '/registration-places',
    permissions: ['base-info.registration-places'],
  },
  { prefix: '/documents', permissions: ['base-info.documents'] },
  { prefix: '/work-units', permissions: ['base-info.work-units'] },
  { prefix: '/staff-posts', permissions: ['base-info.staff-posts'] },
  { prefix: '/sms/settings', permissions: ['sms.settings'] },
  { prefix: '/sms/history', permissions: ['sms.history'] },
  { prefix: '/sms/messages', permissions: ['sms.send'] },
  { prefix: '/violation-types', permissions: ['inspection.violation-types'] },
  {
    prefix: '/violations/report',
    permissions: ['inspection.violations.reports'],
  },
  {
    prefix: '/violations',
    permissions: ['inspection.violations', 'inspection.violations.register'],
  },
  {
    prefix: '/users/register-check',
    permissions: ['management.userRegister', 'management.users'],
  },
  {
    prefix: '/users/register',
    permissions: ['management.userRegister', 'management.users'],
  },
  { prefix: '/users', permissions: ['management.users'] },
  {
    prefix: '/organization/positions',
    permissions: ['management.users'],
  },
  {
    prefix: '/organization/unit-kinds',
    permissions: ['management.users'],
  },
  { prefix: '/organization/units', permissions: ['management.users'] },
  { prefix: '/organization', permissions: ['management.users'] },
].sort((a, b) => b.prefix.length - a.prefix.length);

export type AccessDecision =
  | { kind: 'public' }
  | { kind: 'auth' }
  | { kind: 'permission'; permissions: string[] };

export function normalizeApiPath(rawPath: string) {
  const withoutQuery = rawPath.split('?')[0] ?? '';
  const path = withoutQuery.startsWith('/api/')
    ? withoutQuery.slice(4)
    : withoutQuery === '/api'
      ? '/'
      : withoutQuery;
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }
  return path || '/';
}

function matchesPrefix(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

export function resolveAccessDecision(
  method: string,
  rawPath: string,
  query: Record<string, unknown> = {},
): AccessDecision {
  const path = normalizeApiPath(rawPath);
  const verb = method.toUpperCase();

  if (
    PUBLIC_ROUTES.some(
      (route) =>
        matchesPrefix(path, route.prefix) &&
        (!route.method || route.method === verb),
    )
  ) {
    return { kind: 'public' };
  }

  if (AUTH_ONLY_PREFIXES.some((prefix) => matchesPrefix(path, prefix))) {
    return { kind: 'auth' };
  }

  if (verb === 'GET' && query.page == null && LOOKUP_COLLECTIONS.has(path)) {
    return { kind: 'auth' };
  }

  const mapped = ROUTE_PERMISSIONS.find((route) =>
    matchesPrefix(path, route.prefix),
  );
  if (mapped) {
    return { kind: 'permission', permissions: mapped.permissions };
  }

  return { kind: 'auth' };
}
