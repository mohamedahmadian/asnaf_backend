export type PermissionKind = 'MODULE' | 'MENU';

export type PermissionNode = {
  code: string;
  kind: PermissionKind;
  nameKey: string;
  children?: PermissionNode[];
};

export const PERMISSION_TREE: PermissionNode[] = [
  {
    code: 'dashboard',
    kind: 'MODULE',
    nameKey: 'modules.dashboard',
    children: [
      { code: 'dashboard.home', kind: 'MENU', nameKey: 'menus.overview' },
    ],
  },
  {
    code: 'cases',
    kind: 'MODULE',
    nameKey: 'modules.cases',
    children: [
      { code: 'cases.formation', kind: 'MENU', nameKey: 'menus.caseFormation' },
      { code: 'cases.management', kind: 'MENU', nameKey: 'menus.caseManagement' },
      { code: 'cases.inquiries', kind: 'MENU', nameKey: 'menus.caseInquiries' },
      { code: 'cases.places', kind: 'MENU', nameKey: 'menus.casePlaces' },
      { code: 'cases.reports', kind: 'MENU', nameKey: 'menus.caseReports' },
      { code: 'cases.settings', kind: 'MENU', nameKey: 'menus.caseSettings' },
    ],
  },
  {
    code: 'finance',
    kind: 'MODULE',
    nameKey: 'modules.finance',
    children: [
      { code: 'finance.bank-accounts', kind: 'MENU', nameKey: 'menus.bankAccounts' },
      { code: 'finance.municipal-fees', kind: 'MENU', nameKey: 'menus.municipalFees' },
      { code: 'finance.discounts', kind: 'MENU', nameKey: 'menus.discounts' },
    ],
  },
  {
    code: 'inspection',
    kind: 'MODULE',
    nameKey: 'modules.inspectionComplaints',
    children: [
      {
        code: 'inspection.violations.register',
        kind: 'MENU',
        nameKey: 'menus.violationRegister',
      },
      {
        code: 'inspection.violations',
        kind: 'MENU',
        nameKey: 'menus.violations',
      },
      {
        code: 'inspection.violations.reports',
        kind: 'MENU',
        nameKey: 'menus.violationReports',
      },
      {
        code: 'inspection.violation-types',
        kind: 'MENU',
        nameKey: 'menus.violationTypes',
      },
    ],
  },
  {
    code: 'base-info',
    kind: 'MODULE',
    nameKey: 'modules.baseInfo',
    children: [
      { code: 'base-info.job-types', kind: 'MENU', nameKey: 'menus.jobTypes' },
      {
        code: 'base-info.job-groups',
        kind: 'MENU',
        nameKey: 'menus.jobGroups',
      },
      { code: 'base-info.jobs', kind: 'MENU', nameKey: 'menus.jobs' },
      {
        code: 'base-info.registration-places',
        kind: 'MENU',
        nameKey: 'menus.registrationPlaces',
      },
      { code: 'base-info.countries', kind: 'MENU', nameKey: 'menus.countries' },
      { code: 'base-info.provinces', kind: 'MENU', nameKey: 'menus.provinces' },
      { code: 'base-info.cities', kind: 'MENU', nameKey: 'menus.cities' },
      {
        code: 'base-info.commercial-complexes',
        kind: 'MENU',
        nameKey: 'menus.commercialComplexes',
      },
      {
        code: 'base-info.inquiry-centers',
        kind: 'MENU',
        nameKey: 'menus.inquiryCenters',
      },
      { code: 'base-info.documents', kind: 'MENU', nameKey: 'menus.documents' },
      { code: 'base-info.work-units', kind: 'MENU', nameKey: 'menus.workUnits' },
      { code: 'base-info.staff-posts', kind: 'MENU', nameKey: 'menus.staffPosts' },
    ],
  },
  {
    code: 'sms',
    kind: 'MODULE',
    nameKey: 'modules.sms',
    children: [
      { code: 'sms.settings', kind: 'MENU', nameKey: 'menus.smsSettings' },
      { code: 'sms.send', kind: 'MENU', nameKey: 'menus.smsSend' },
    ],
  },
  {
    code: 'management',
    kind: 'MODULE',
    nameKey: 'modules.management',
    children: [
      {
        code: 'management.userRegister',
        kind: 'MENU',
        nameKey: 'menus.userRegister',
      },
      { code: 'management.users', kind: 'MENU', nameKey: 'menus.users' },
      { code: 'management.roles', kind: 'MENU', nameKey: 'menus.roles' },
    ],
  },
];

const permissionCodes = new Set<string>();

function collectCodes(nodes: PermissionNode[]) {
  for (const node of nodes) {
    permissionCodes.add(node.code);
    if (node.children) collectCodes(node.children);
  }
}

collectCodes(PERMISSION_TREE);

export function isKnownPermissionCode(code: string) {
  return permissionCodes.has(code);
}

export function parentPermissionCode(code: string) {
  const index = code.lastIndexOf('.');
  return index > 0 ? code.slice(0, index) : null;
}
