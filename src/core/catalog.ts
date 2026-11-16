/**
 * Catálogo de tipos de proyecto del AI Builder.
 * Cada ítem apunta a un arquetipo de la base de conocimiento (ver blueprint/knowledge.ts).
 */

export interface CatalogItem {
  id: string;
  label: string;
  archetype: string;
}

export interface CatalogGroup {
  id: string;
  label: string;
  description: string;
  items: CatalogItem[];
}

const slug = (label: string) =>
  label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const items = (pairs: [label: string, archetype: string][]): CatalogItem[] =>
  pairs.map(([label, archetype]) => ({ id: slug(label), label, archetype }));

export const CATALOG: CatalogGroup[] = [
  {
    id: 'business',
    label: 'Business Management',
    description: 'Sistemas para operar y administrar una organización.',
    items: items([
      ['CRM', 'crm'],
      ['ERP', 'erp'],
      ['HRM', 'hrm'],
      ['Gestión de clientes', 'crm'],
      ['Gestión de proveedores', 'proveedores'],
      ['Gestión de inventarios', 'inventario'],
      ['Gestión de facturación', 'facturacion'],
      ['Gestión comercial', 'crm'],
      ['Gestión financiera', 'finanzas'],
      ['Gestión documental', 'documental'],
      ['Gestión de procesos', 'procesos'],
      ['Customer Support', 'soporte'],
      ['Ticketing System', 'soporte'],
      ['Portales internos', 'portal'],
      ['Sistemas administrativos', 'portal'],
    ]),
  },
  {
    id: 'pm',
    label: 'Project Management',
    description: 'Planificación, seguimiento y control de proyectos y equipos.',
    items: items([
      ['Gestión de proyectos', 'proyectos'],
      ['Kanban', 'kanban'],
      ['Scrum', 'scrum'],
      ['Agile Project Management', 'scrum'],
      ['Gantt Chart', 'proyectos'],
      ['Gestión de tareas', 'kanban'],
      ['Gestión de recursos', 'proyectos'],
      ['Gestión de presupuestos', 'proyectos'],
      ['Gestión de riesgos', 'proyectos'],
      ['Gestión de equipos', 'proyectos'],
      ['Gestión de tiempos', 'proyectos'],
      ['Seguimiento de entregables', 'proyectos'],
      ['Gestión de portafolios', 'proyectos'],
      ['OKR Management', 'okr'],
      ['KPI Tracking', 'okr'],
      ['Roadmaps', 'proyectos'],
      ['Gestión de sprints', 'scrum'],
    ]),
  },
  {
    id: 'data',
    label: 'Data Analytics & Business Intelligence',
    description: 'Análisis, visualización y gestión de datos.',
    items: items([
      ['Dashboards', 'analitica'],
      ['Business Intelligence', 'analitica'],
      ['Data Analytics', 'analitica'],
      ['Data Visualization', 'analitica'],
      ['Reporting System', 'analitica'],
      ['ETL / ELT', 'datos'],
      ['Data Pipeline', 'datos'],
      ['Data Warehouse', 'datos'],
      ['Data Management', 'datos'],
      ['Data Quality', 'datos'],
      ['Data Catalog', 'datos'],
      ['SQL Analytics', 'analitica'],
      ['Data Monitoring', 'analitica'],
      ['Predictive Analytics', 'predictivo'],
      ['Machine Learning Applications', 'predictivo'],
      ['Forecasting', 'predictivo'],
      ['Performance Analytics', 'analitica'],
    ]),
  },
  {
    id: 'saas',
    label: 'SaaS & Digital Products',
    description: 'Productos digitales para clientes y comunidades.',
    items: items([
      ['SaaS Platform', 'saas'],
      ['Multi-Tenant SaaS', 'saas'],
      ['Marketplace', 'marketplace'],
      ['Customer Portal', 'portal'],
      ['Membership Platform', 'comunidad'],
      ['Subscription Management', 'saas'],
      ['E-commerce', 'ecommerce'],
      ['Booking System', 'reservas'],
      ['Reservation System', 'reservas'],
      ['Learning Management System', 'lms'],
      ['Community Platform', 'comunidad'],
    ]),
  },
  {
    id: 'dev',
    label: 'Development & Infrastructure',
    description: 'APIs, servicios, automatizaciones y herramientas internas.',
    items: items([
      ['API REST', 'api'],
      ['GraphQL API', 'api'],
      ['Backend', 'api'],
      ['Microservices', 'api'],
      ['Webhooks', 'integraciones'],
      ['Authentication System', 'api'],
      ['Integration Platform', 'integraciones'],
      ['Automation Tool', 'integraciones'],
      ['Admin Panel', 'admin'],
      ['Developer Tools', 'admin'],
      ['Internal API', 'api'],
      ['Database Management', 'admin'],
    ]),
  },
  {
    id: 'web',
    label: 'Web & Content',
    description: 'Sitios, portales y plataformas de contenido.',
    items: items([
      ['Corporate Website', 'sitio'],
      ['Landing Page', 'sitio'],
      ['Portfolio', 'sitio'],
      ['Blog', 'contenido'],
      ['CMS', 'contenido'],
      ['Documentation Website', 'contenido'],
      ['Business Website', 'sitio'],
      ['Personal Website', 'sitio'],
      ['Institutional Website', 'sitio'],
      ['News Portal', 'contenido'],
    ]),
  },
  {
    id: 'custom',
    label: 'Personalizados',
    description: 'Soluciones a medida o combinaciones de varios tipos.',
    items: items([
      ['Aplicación personalizada', 'personalizado'],
      ['Sistema híbrido', 'personalizado'],
      ['Proyecto desde cero', 'personalizado'],
      ['Otro tipo de solución', 'personalizado'],
    ]),
  },
];

const byId = new Map<string, CatalogItem & { group: string }>();
for (const group of CATALOG) for (const item of group.items) byId.set(item.id, { ...item, group: group.id });

export const catalogItem = (id: string) => byId.get(id);
export const categoryLabel = (id: string) => byId.get(id)?.label ?? id;
export const isCategoryId = (id: string) => byId.has(id);
export const CATALOG_SIZE = byId.size;

/** Primera categoría del catálogo asociada a un arquetipo (para sugerencias). */
export function categoryForArchetype(archetype: string): string | undefined {
  for (const item of byId.values()) if (item.archetype === archetype) return item.id;
  return undefined;
}
