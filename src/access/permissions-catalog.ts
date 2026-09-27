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
    code: 'base-info',
    kind: 'MODULE',
    nameKey: 'modules.baseInfo',
    children: [
      { code: 'base-info.countries', kind: 'MENU', nameKey: 'menus.countries' },
      { code: 'base-info.provinces', kind: 'MENU', nameKey: 'menus.provinces' },
      { code: 'base-info.cities', kind: 'MENU', nameKey: 'menus.cities' },
      {
        code: 'base-info.commercial-complexes',
        kind: 'MENU',
        nameKey: 'menus.commercialComplexes',
      },
      { code: 'base-info.bank-accounts', kind: 'MENU', nameKey: 'menus.bankAccounts' },
      { code: 'base-info.municipal-fees', kind: 'MENU', nameKey: 'menus.municipalFees' },
      { code: 'base-info.discounts', kind: 'MENU', nameKey: 'menus.discounts' },
      { code: 'base-info.job-types', kind: 'MENU', nameKey: 'menus.jobTypes' },
      {
        code: 'base-info.inquiry-centers',
        kind: 'MENU',
        nameKey: 'menus.inquiryCenters',
      },
      {
        code: 'base-info.job-groups',
        kind: 'MENU',
        nameKey: 'menus.jobGroups',
      },
      { code: 'base-info.jobs', kind: 'MENU', nameKey: 'menus.jobs' },
      { code: 'base-info.documents', kind: 'MENU', nameKey: 'menus.documents' },
      { code: 'base-info.work-units', kind: 'MENU', nameKey: 'menus.workUnits' },
      { code: 'base-info.staff-posts', kind: 'MENU', nameKey: 'menus.staffPosts' },
    ],
  },
  {
    code: 'inspection',
    kind: 'MODULE',
    nameKey: 'modules.inspectionComplaints',
    children: [
      {
        code: 'inspection.violation-types',
        kind: 'MENU',
        nameKey: 'menus.violationTypes',
      },
    ],
  },
  {
    code: 'management',
    kind: 'MODULE',
    nameKey: 'modules.management',
    children: [
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
