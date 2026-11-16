/**
 * Base de conocimiento del motor local de Blueprint.
 *
 * Cada arquetipo describe una familia de soluciones: módulos típicos, entidades de datos,
 * roles y riesgos. El motor combina arquetipos con capacidades transversales según la
 * especificación del usuario. No usa IA: es determinístico y verificable.
 */

export type SolutionStyle = 'aplicacion' | 'datos' | 'api' | 'sitio';

export interface ModuleDef {
  nombre: string;
  descripcion: string;
  funcionalidades: string[];
  /** Raíces de palabras que indican que el usuario pidió este módulo de forma explícita. */
  claves: string[];
}
export interface EntityDef {
  entidad: string;
  descripcion: string;
  campos: { nombre: string; tipo: string }[];
  relaciones: string[];
}
export interface RoleDef {
  rol: string;
  descripcion: string;
  permisos: string[];
}
export interface RiskDef {
  riesgo: string;
  impacto: 'alto' | 'medio' | 'bajo';
  mitigacion: string;
}
export interface Archetype {
  id: string;
  label: string;
  style: SolutionStyle;
  claves: string[];
  objetivos: string[];
  modulos: ModuleDef[];
  entidades: EntityDef[];
  roles: RoleDef[];
  riesgos: RiskDef[];
}

const m = (nombre: string, descripcion: string, funcionalidades: string[], claves: string[] = []): ModuleDef => ({
  nombre,
  descripcion,
  funcionalidades,
  claves,
});

/** Entidad a partir de una lista compacta "campo:tipo, campo:tipo". Siempre incluye id y fechas. */
const e = (entidad: string, descripcion: string, campos: string, relaciones: string[] = []): EntityDef => ({
  entidad,
  descripcion,
  campos: [
    { nombre: 'id', tipo: 'uuid' },
    ...campos.split(',').map((raw) => {
      const [nombre = '', tipo = 'texto'] = raw.trim().split(':');
      return { nombre: nombre.trim(), tipo: tipo.trim() };
    }),
    { nombre: 'creado_en', tipo: 'fecha y hora' },
  ],
  relaciones,
});
const r = (rol: string, descripcion: string, permisos: string[]): RoleDef => ({ rol, descripcion, permisos });
const k = (riesgo: string, impacto: RiskDef['impacto'], mitigacion: string): RiskDef => ({ riesgo, impacto, mitigacion });

const ADMIN = r('Administrador', 'Configura el sistema y gestiona usuarios y permisos.', [
  'Acceso completo a todos los módulos',
  'Alta, baja y modificación de usuarios y roles',
  'Configuración general',
]);

export const ARCHETYPES: Archetype[] = [
  {
    id: 'crm',
    label: 'CRM (gestión de relaciones con clientes)',
    style: 'aplicacion',
    claves: ['crm', 'cliente', 'lead', 'prospecto', 'oportunidad', 'venta', 'pipeline', 'embudo', 'contacto', 'comercial', 'vendedor'],
    objetivos: [
      'Centralizar la información de clientes y prospectos en un único lugar.',
      'Dar visibilidad del pipeline comercial y del estado de cada oportunidad.',
      'Registrar el historial de interacciones para dar continuidad al seguimiento.',
    ],
    modulos: [
      m('Contactos y empresas', 'Base unificada de personas y organizaciones con las que se trabaja.', ['Alta y edición de contactos y empresas', 'Búsqueda y filtros por segmento, estado y responsable', 'Ficha con historial completo de interacciones', 'Detección de duplicados al cargar'], ['contacto', 'cliente', 'empresa']),
      m('Oportunidades y pipeline', 'Seguimiento de negocios en curso por etapas.', ['Pipeline visual por etapas configurables', 'Monto estimado, probabilidad y fecha de cierre', 'Asignación de responsable', 'Motivos de pérdida'], ['oportunidad', 'pipeline', 'embudo', 'negocio', 'venta']),
      m('Actividades y seguimiento', 'Registro de llamadas, reuniones, correos y tareas.', ['Tareas con vencimiento y recordatorios', 'Registro de llamadas, reuniones y notas', 'Agenda por vendedor'], ['seguimiento', 'actividad', 'llamada', 'reunion', 'tarea']),
      m('Reportes comerciales', 'Indicadores de desempeño del equipo de ventas.', ['Ventas por período y por vendedor', 'Tasa de conversión por etapa', 'Proyección de cierres'], ['reporte', 'indicador', 'conversion', 'proyeccion']),
    ],
    entidades: [
      e('Contacto', 'Persona con la que se mantiene una relación comercial.', 'nombre:texto, email:texto, telefono:texto, cargo:texto, estado:enum, empresa_id:uuid, responsable_id:uuid', ['Pertenece a una Empresa', 'Tiene muchas Actividades']),
      e('Empresa', 'Organización cliente o prospecto.', 'razon_social:texto, rubro:texto, tamano:enum, sitio_web:texto, pais:texto', ['Tiene muchos Contactos', 'Tiene muchas Oportunidades']),
      e('Oportunidad', 'Negocio potencial en seguimiento.', 'titulo:texto, etapa:enum, monto:decimal, probabilidad:entero, cierre_estimado:fecha, empresa_id:uuid, responsable_id:uuid', ['Pertenece a una Empresa', 'Tiene muchas Actividades']),
      e('Actividad', 'Interacción o tarea asociada a un contacto u oportunidad.', 'tipo:enum, descripcion:texto, vence_en:fecha y hora, completada:booleano, contacto_id:uuid, oportunidad_id:uuid'),
    ],
    roles: [ADMIN, r('Gerente comercial', 'Supervisa el equipo y el pipeline completo.', ['Ver y reasignar oportunidades de todo el equipo', 'Acceso a reportes comerciales']), r('Vendedor', 'Gestiona sus propios contactos y oportunidades.', ['Crear y editar sus contactos y oportunidades', 'Registrar actividades'])],
    riesgos: [k('Datos de contactos duplicados o incompletos al migrar desde planillas.', 'medio', 'Importación con validación, detección de duplicados y revisión previa.'), k('Baja adopción por parte del equipo comercial.', 'medio', 'Carga rápida de actividades y vistas simples enfocadas en el trabajo diario.')],
  },
  {
    id: 'erp',
    label: 'ERP (planificación de recursos empresariales)',
    style: 'aplicacion',
    claves: ['erp', 'compras', 'contabilidad', 'recursos empresariales', 'gestion integral', 'administracion integral'],
    objetivos: ['Integrar compras, ventas, stock y finanzas en un único sistema.', 'Eliminar la doble carga de datos entre áreas.', 'Tener información consolidada para la toma de decisiones.'],
    modulos: [
      m('Compras y proveedores', 'Ciclo de abastecimiento.', ['Registro de proveedores', 'Órdenes de compra con aprobación', 'Recepción de mercadería'], ['compra', 'proveedor', 'abastecimiento']),
      m('Ventas y facturación', 'Ciclo comercial y emisión de comprobantes.', ['Presupuestos y pedidos de venta', 'Emisión de facturas', 'Cuentas corrientes de clientes'], ['venta', 'factura', 'pedido', 'presupuesto']),
      m('Inventario', 'Existencias y movimientos de stock.', ['Catálogo de productos', 'Entradas, salidas y ajustes de stock', 'Alertas de stock mínimo'], ['inventario', 'stock', 'producto', 'deposito']),
      m('Contabilidad y finanzas', 'Registro contable básico y tesorería.', ['Plan de cuentas', 'Asientos generados desde compras y ventas', 'Cobros, pagos y flujo de caja'], ['contab', 'finanza', 'tesoreria', 'asiento']),
    ],
    entidades: [
      e('Producto', 'Bien o servicio que se compra o vende.', 'codigo:texto, nombre:texto, unidad:texto, costo:decimal, precio:decimal, stock_minimo:entero'),
      e('Proveedor', 'Empresa o persona a la que se compra.', 'razon_social:texto, identificacion_fiscal:texto, email:texto, condicion_pago:texto', ['Tiene muchas Órdenes de compra']),
      e('OrdenCompra', 'Pedido formal a un proveedor.', 'numero:texto, estado:enum, fecha:fecha, total:decimal, proveedor_id:uuid', ['Pertenece a un Proveedor', 'Tiene muchos ítems de Producto']),
      e('Factura', 'Comprobante de venta emitido.', 'numero:texto, fecha:fecha, estado:enum, total:decimal, cliente_id:uuid', ['Tiene muchos ítems de Producto']),
      e('AsientoContable', 'Registro contable de una operación.', 'fecha:fecha, concepto:texto, debe:decimal, haber:decimal, cuenta_id:uuid'),
    ],
    roles: [ADMIN, r('Compras', 'Gestiona proveedores y órdenes de compra.', ['Crear órdenes de compra', 'Registrar recepciones']), r('Ventas', 'Gestiona pedidos y facturación.', ['Crear presupuestos, pedidos y facturas']), r('Contabilidad', 'Controla registros contables y tesorería.', ['Ver y ajustar asientos', 'Registrar cobros y pagos'])],
    riesgos: [k('Alcance muy amplio para una primera versión.', 'alto', 'Implementar por módulos, empezando por el ciclo que hoy genera más trabajo manual.'), k('Requisitos fiscales y contables propios de cada país.', 'alto', 'Relevar la normativa local antes de diseñar facturación y contabilidad.')],
  },
  {
    id: 'hrm',
    label: 'HRM (gestión de recursos humanos)',
    style: 'aplicacion',
    claves: ['hrm', 'recursos humanos', 'rrhh', 'empleado', 'legajo', 'licencia', 'vacaciones', 'asistencia', 'nomina', 'reclutamiento', 'desempeno'],
    objetivos: ['Mantener legajos de personal actualizados y accesibles.', 'Ordenar solicitudes de licencias y control de asistencia.', 'Dar seguimiento al desarrollo y desempeño de las personas.'],
    modulos: [
      m('Legajos de empleados', 'Información personal, laboral y documental de cada persona.', ['Ficha del empleado con datos y documentos', 'Organigrama y puestos', 'Historial laboral'], ['legajo', 'empleado', 'organigrama']),
      m('Asistencia y licencias', 'Control de presencia y ausencias.', ['Solicitud y aprobación de licencias', 'Saldo de vacaciones', 'Registro de asistencia'], ['licencia', 'vacacion', 'asistencia', 'ausencia']),
      m('Reclutamiento', 'Búsquedas y postulantes.', ['Publicación de búsquedas', 'Seguimiento de postulantes por etapa'], ['reclutamiento', 'postulante', 'busqueda laboral', 'seleccion']),
      m('Evaluaciones de desempeño', 'Ciclos de evaluación y objetivos.', ['Formularios de evaluación configurables', 'Objetivos individuales', 'Historial de evaluaciones'], ['desempeno', 'evaluacion']),
    ],
    entidades: [
      e('Empleado', 'Persona que trabaja en la organización.', 'nombre:texto, documento:texto, email:texto, fecha_ingreso:fecha, estado:enum, puesto_id:uuid, jefe_id:uuid', ['Ocupa un Puesto', 'Tiene muchas Licencias']),
      e('Puesto', 'Posición dentro de la estructura.', 'nombre:texto, area:texto, nivel:texto'),
      e('Licencia', 'Ausencia solicitada por un empleado.', 'tipo:enum, desde:fecha, hasta:fecha, estado:enum, empleado_id:uuid, aprobador_id:uuid'),
      e('Evaluacion', 'Evaluación de desempeño de un período.', 'periodo:texto, puntaje:decimal, comentarios:texto, empleado_id:uuid, evaluador_id:uuid'),
    ],
    roles: [ADMIN, r('Recursos Humanos', 'Administra legajos, licencias y evaluaciones.', ['Acceso a todos los legajos', 'Aprobar licencias', 'Configurar evaluaciones']), r('Jefe de equipo', 'Gestiona a las personas a su cargo.', ['Aprobar licencias de su equipo', 'Evaluar a su equipo']), r('Empleado', 'Consulta sus datos y realiza solicitudes.', ['Ver su legajo', 'Solicitar licencias'])],
    riesgos: [k('Tratamiento de datos personales sensibles.', 'alto', 'Permisos estrictos por rol, cifrado y registro de accesos.'), k('Reglas laborales específicas de cada país.', 'medio', 'Parametrizar tipos de licencia y cálculos en lugar de fijarlos en el código.')],
  },
  {
    id: 'proveedores',
    label: 'Gestión de proveedores',
    style: 'aplicacion',
    claves: ['proveedor', 'compras', 'licitacion', 'cotizacion', 'abastecimiento'],
    objetivos: ['Mantener un registro confiable de proveedores.', 'Ordenar el proceso de cotización y compra.', 'Evaluar el cumplimiento de cada proveedor.'],
    modulos: [
      m('Registro de proveedores', 'Datos, documentación y rubros.', ['Ficha del proveedor con documentación', 'Clasificación por rubro', 'Estado de habilitación'], ['proveedor']),
      m('Cotizaciones y órdenes de compra', 'Pedidos de precio y compras.', ['Solicitud de cotización a varios proveedores', 'Comparativa de ofertas', 'Órdenes de compra con aprobación'], ['cotizacion', 'orden de compra', 'compra']),
      m('Evaluación de proveedores', 'Seguimiento de cumplimiento.', ['Calificación por entrega, calidad y precio', 'Historial de incidentes'], ['evaluacion', 'calificacion']),
    ],
    entidades: [
      e('Proveedor', 'Empresa o persona que provee bienes o servicios.', 'razon_social:texto, identificacion_fiscal:texto, rubro:texto, email:texto, estado:enum'),
      e('Cotizacion', 'Oferta recibida de un proveedor.', 'fecha:fecha, total:decimal, validez:fecha, proveedor_id:uuid'),
      e('OrdenCompra', 'Compra confirmada.', 'numero:texto, estado:enum, total:decimal, proveedor_id:uuid'),
      e('EvaluacionProveedor', 'Calificación periódica.', 'periodo:texto, puntaje:decimal, observaciones:texto, proveedor_id:uuid'),
    ],
    roles: [ADMIN, r('Compras', 'Gestiona proveedores y órdenes.', ['Crear cotizaciones y órdenes', 'Evaluar proveedores']), r('Aprobador', 'Autoriza compras según monto.', ['Aprobar o rechazar órdenes de compra'])],
    riesgos: [k('Circuitos de aprobación distintos según monto o área.', 'medio', 'Modelar reglas de aprobación configurables.')],
  },
  {
    id: 'inventario',
    label: 'Gestión de inventarios',
    style: 'aplicacion',
    claves: ['inventario', 'stock', 'deposito', 'almacen', 'existencia', 'mercaderia', 'producto', 'reposicion'],
    objetivos: ['Conocer en todo momento las existencias reales.', 'Registrar cada movimiento de stock con su responsable.', 'Anticipar faltantes mediante alertas de reposición.'],
    modulos: [
      m('Catálogo de productos', 'Artículos, categorías y unidades.', ['Alta de productos con código y categoría', 'Unidades de medida y variantes', 'Importación desde planillas'], ['producto', 'catalogo', 'articulo']),
      m('Movimientos de stock', 'Entradas, salidas, transferencias y ajustes.', ['Registro de entradas y salidas', 'Transferencias entre depósitos', 'Ajustes con motivo'], ['movimiento', 'entrada', 'salida', 'transferencia']),
      m('Depósitos y ubicaciones', 'Lugares físicos de almacenamiento.', ['Stock por depósito', 'Ubicaciones internas'], ['deposito', 'almacen', 'ubicacion']),
      m('Alertas y reposición', 'Control de mínimos y conteos.', ['Alertas de stock mínimo', 'Conteos de inventario', 'Sugerencia de reposición'], ['alerta', 'minimo', 'reposicion', 'conteo']),
    ],
    entidades: [
      e('Producto', 'Artículo inventariable.', 'codigo:texto, nombre:texto, categoria:texto, unidad:texto, stock_minimo:entero, costo:decimal'),
      e('Deposito', 'Lugar de almacenamiento.', 'nombre:texto, direccion:texto'),
      e('MovimientoStock', 'Cambio en las existencias.', 'tipo:enum, cantidad:decimal, motivo:texto, producto_id:uuid, deposito_id:uuid, usuario_id:uuid', ['Pertenece a un Producto y a un Depósito']),
      e('ConteoInventario', 'Recuento físico para conciliar.', 'fecha:fecha, estado:enum, deposito_id:uuid'),
    ],
    roles: [ADMIN, r('Encargado de depósito', 'Registra movimientos y conteos.', ['Registrar entradas, salidas y transferencias', 'Realizar conteos']), r('Consulta', 'Sólo visualiza existencias.', ['Ver stock y reportes'])],
    riesgos: [k('Diferencias entre el stock registrado y el físico.', 'medio', 'Conteos periódicos y ajustes siempre con motivo y responsable.')],
  },
  {
    id: 'facturacion',
    label: 'Gestión de facturación',
    style: 'aplicacion',
    claves: ['factura', 'comprobante', 'cobranza', 'cobro', 'nota de credito', 'recibo', 'cuenta corriente'],
    objetivos: ['Emitir comprobantes de forma rápida y sin errores.', 'Controlar saldos y vencimientos de clientes.', 'Reducir el tiempo de cobranza.'],
    modulos: [
      m('Clientes y condiciones', 'Datos fiscales y condiciones comerciales.', ['Ficha fiscal del cliente', 'Condiciones de pago y listas de precios'], ['cliente']),
      m('Emisión de comprobantes', 'Facturas, notas de crédito y recibos.', ['Emisión de facturas con ítems e impuestos', 'Notas de crédito y débito', 'Numeración y descarga en PDF'], ['factura', 'comprobante', 'nota de credito']),
      m('Cobranzas', 'Seguimiento de pagos y saldos.', ['Registro de pagos parciales y totales', 'Cuenta corriente por cliente', 'Avisos de vencimiento'], ['cobranza', 'cobro', 'pago', 'vencimiento']),
      m('Reportes de facturación', 'Resumen de ventas e impuestos.', ['Ventas por período y cliente', 'Libro de comprobantes emitidos'], ['reporte', 'libro']),
    ],
    entidades: [
      e('Cliente', 'Persona o empresa a la que se factura.', 'razon_social:texto, identificacion_fiscal:texto, email:texto, condicion_pago:texto'),
      e('Factura', 'Comprobante emitido.', 'numero:texto, tipo:enum, fecha:fecha, vencimiento:fecha, estado:enum, subtotal:decimal, impuestos:decimal, total:decimal, cliente_id:uuid', ['Pertenece a un Cliente', 'Tiene muchos Ítems', 'Tiene muchos Pagos']),
      e('ItemFactura', 'Línea de detalle.', 'descripcion:texto, cantidad:decimal, precio_unitario:decimal, impuesto:decimal, factura_id:uuid'),
      e('Pago', 'Cobro aplicado a una factura.', 'fecha:fecha, monto:decimal, medio:enum, factura_id:uuid'),
    ],
    roles: [ADMIN, r('Facturación', 'Emite comprobantes y registra cobros.', ['Crear facturas y notas de crédito', 'Registrar pagos']), r('Consulta', 'Visualiza comprobantes y reportes.', ['Ver comprobantes y saldos'])],
    riesgos: [k('Normativa fiscal local, incluida la facturación electrónica.', 'alto', 'Relevar los requisitos de la autoridad tributaria y prever la integración correspondiente.'), k('Errores de numeración o de cálculo de impuestos.', 'alto', 'Cálculos en el servidor con pruebas automatizadas y numeración controlada por transacción.')],
  },
  {
    id: 'finanzas',
    label: 'Gestión financiera',
    style: 'aplicacion',
    claves: ['finanza', 'financier', 'presupuesto', 'flujo de caja', 'gasto', 'ingreso', 'egreso', 'tesoreria', 'conciliacion'],
    objetivos: ['Registrar ingresos y egresos con criterio uniforme.', 'Comparar lo ejecutado contra lo presupuestado.', 'Anticipar necesidades de caja.'],
    modulos: [
      m('Ingresos y egresos', 'Registro de movimientos por cuenta y categoría.', ['Carga de movimientos con comprobante', 'Categorías y centros de costo', 'Importación de extractos'], ['ingreso', 'egreso', 'gasto', 'movimiento']),
      m('Presupuestos', 'Planificación por período.', ['Presupuesto por categoría y período', 'Comparativa presupuestado vs. ejecutado'], ['presupuesto']),
      m('Flujo de caja', 'Proyección de fondos.', ['Proyección de saldos', 'Compromisos futuros de cobro y pago'], ['flujo', 'caja', 'proyeccion']),
      m('Conciliación y reportes', 'Control y estados resumidos.', ['Conciliación con extractos bancarios', 'Reportes por período'], ['conciliacion', 'reporte', 'banco']),
    ],
    entidades: [
      e('Cuenta', 'Cuenta bancaria o caja.', 'nombre:texto, tipo:enum, moneda:texto, saldo_inicial:decimal'),
      e('Movimiento', 'Ingreso o egreso.', 'fecha:fecha, tipo:enum, monto:decimal, descripcion:texto, cuenta_id:uuid, categoria_id:uuid', ['Pertenece a una Cuenta y a una Categoría']),
      e('Categoria', 'Clasificación de movimientos.', 'nombre:texto, tipo:enum'),
      e('Presupuesto', 'Monto planificado por categoría y período.', 'periodo:texto, monto:decimal, categoria_id:uuid'),
    ],
    roles: [ADMIN, r('Finanzas', 'Carga movimientos y presupuestos.', ['Registrar movimientos', 'Definir presupuestos', 'Conciliar cuentas']), r('Dirección', 'Consulta estados y proyecciones.', ['Ver reportes y flujo de caja'])],
    riesgos: [k('Manejo de varias monedas y tipos de cambio.', 'medio', 'Guardar cada movimiento en su moneda original con la cotización aplicada.')],
  },
  {
    id: 'documental',
    label: 'Gestión documental',
    style: 'aplicacion',
    claves: ['documental', 'documento', 'archivo', 'expediente', 'repositorio', 'versionado', 'firma'],
    objetivos: ['Reunir los documentos en un repositorio ordenado y seguro.', 'Controlar versiones y aprobaciones.', 'Encontrar cualquier documento en segundos.'],
    modulos: [
      m('Repositorio de documentos', 'Carga y organización en carpetas.', ['Carga de archivos con metadatos', 'Carpetas y etiquetas', 'Vista previa'], ['documento', 'carpeta', 'repositorio']),
      m('Versionado y aprobación', 'Historial de cambios y circuitos de revisión.', ['Historial de versiones', 'Circuito de revisión y aprobación', 'Bloqueo durante edición'], ['version', 'aprobacion', 'revision']),
      m('Búsqueda y metadatos', 'Localización por contenido y atributos.', ['Búsqueda por nombre, etiquetas y metadatos', 'Filtros por tipo, fecha y autor'], ['busqueda', 'buscar', 'metadato']),
      m('Permisos por carpeta', 'Control de acceso granular.', ['Permisos de lectura y edición por carpeta', 'Registro de accesos'], ['permiso', 'acceso']),
    ],
    entidades: [
      e('Documento', 'Archivo gestionado.', 'titulo:texto, tipo:texto, etiquetas:lista, estado:enum, carpeta_id:uuid, autor_id:uuid', ['Pertenece a una Carpeta', 'Tiene muchas Versiones']),
      e('VersionDocumento', 'Estado de un documento en un momento dado.', 'numero:entero, archivo:texto, comentario:texto, documento_id:uuid, autor_id:uuid'),
      e('Carpeta', 'Agrupador jerárquico.', 'nombre:texto, carpeta_padre_id:uuid'),
      e('Aprobacion', 'Decisión sobre una versión.', 'estado:enum, comentario:texto, version_id:uuid, aprobador_id:uuid'),
    ],
    roles: [ADMIN, r('Editor', 'Carga y actualiza documentos.', ['Subir documentos y nuevas versiones']), r('Aprobador', 'Revisa y aprueba versiones.', ['Aprobar o rechazar versiones']), r('Lector', 'Consulta documentos.', ['Ver y descargar documentos permitidos'])],
    riesgos: [k('Volumen y tamaño de archivos.', 'medio', 'Almacenamiento de objetos externo y límites de tamaño por archivo.'), k('Exposición de documentos confidenciales.', 'alto', 'Permisos por carpeta, enlaces con vencimiento y auditoría de accesos.')],
  },
  {
    id: 'procesos',
    label: 'Gestión de procesos y aprobaciones',
    style: 'aplicacion',
    claves: ['proceso', 'workflow', 'flujo de trabajo', 'aprobacion', 'solicitud', 'tramite', 'bpm'],
    objetivos: ['Estandarizar cómo se piden y aprueban las cosas.', 'Saber en qué etapa está cada solicitud.', 'Medir tiempos de resolución.'],
    modulos: [
      m('Diseño de flujos', 'Definición de etapas y responsables.', ['Etapas configurables por tipo de proceso', 'Responsables por etapa', 'Formularios por tipo de solicitud'], ['flujo', 'etapa', 'workflow']),
      m('Solicitudes y aprobaciones', 'Inicio y resolución de trámites.', ['Creación de solicitudes', 'Aprobación, rechazo o devolución', 'Comentarios y adjuntos'], ['solicitud', 'aprobacion', 'tramite']),
      m('Bandeja de tareas', 'Pendientes de cada persona.', ['Bandeja personal de pendientes', 'Avisos de vencimiento'], ['bandeja', 'pendiente']),
      m('Seguimiento y tiempos', 'Trazabilidad e indicadores.', ['Historial de cada solicitud', 'Tiempos por etapa'], ['seguimiento', 'sla', 'tiempo']),
    ],
    entidades: [
      e('Proceso', 'Tipo de trámite con sus etapas.', 'nombre:texto, descripcion:texto, activo:booleano', ['Tiene muchas Etapas']),
      e('Etapa', 'Paso dentro de un proceso.', 'nombre:texto, orden:entero, rol_responsable:texto, proceso_id:uuid'),
      e('Solicitud', 'Instancia de un proceso.', 'titulo:texto, estado:enum, datos:json, etapa_actual_id:uuid, solicitante_id:uuid', ['Pertenece a un Proceso', 'Tiene muchas Aprobaciones']),
      e('Aprobacion', 'Decisión tomada en una etapa.', 'decision:enum, comentario:texto, solicitud_id:uuid, usuario_id:uuid'),
    ],
    roles: [ADMIN, r('Solicitante', 'Inicia y sigue sus solicitudes.', ['Crear solicitudes', 'Ver el estado de las propias']), r('Aprobador', 'Resuelve las etapas asignadas.', ['Aprobar, rechazar o devolver'])],
    riesgos: [k('Procesos reales con excepciones no documentadas.', 'medio', 'Relevar casos reales antes de modelar y permitir devoluciones y reasignaciones.')],
  },
  {
    id: 'soporte',
    label: 'Sistema de soporte y tickets',
    style: 'aplicacion',
    claves: ['ticket', 'soporte', 'mesa de ayuda', 'helpdesk', 'reclamo', 'incidente', 'atencion al cliente', 'customer support'],
    objetivos: ['Registrar cada consulta y darle seguimiento hasta resolverla.', 'Cumplir los tiempos de respuesta comprometidos.', 'Reducir consultas repetidas con una base de conocimiento.'],
    modulos: [
      m('Tickets', 'Recepción, asignación y resolución.', ['Creación de tickets por formulario o email', 'Asignación, prioridad y estados', 'Conversación con el solicitante', 'Notas internas'], ['ticket', 'reclamo', 'incidente']),
      m('Base de conocimiento', 'Artículos de ayuda.', ['Artículos por categoría', 'Búsqueda', 'Sugerencia de artículos al crear un ticket'], ['base de conocimiento', 'articulo', 'faq']),
      m('Tiempos de respuesta y escalamiento', 'Reglas por prioridad.', ['Objetivos de respuesta por prioridad', 'Escalamiento automático'], ['sla', 'escalamiento', 'tiempo de respuesta']),
      m('Reportes de atención', 'Indicadores del servicio.', ['Tickets por estado, agente y categoría', 'Tiempo medio de resolución', 'Satisfacción'], ['reporte', 'satisfaccion']),
    ],
    entidades: [
      e('Ticket', 'Consulta o incidente.', 'asunto:texto, estado:enum, prioridad:enum, categoria:texto, solicitante_id:uuid, agente_id:uuid, resuelto_en:fecha y hora', ['Tiene muchos Mensajes']),
      e('MensajeTicket', 'Respuesta o nota.', 'cuerpo:texto, interno:booleano, ticket_id:uuid, autor_id:uuid'),
      e('Solicitante', 'Persona que pide ayuda.', 'nombre:texto, email:texto, organizacion:texto'),
      e('ArticuloAyuda', 'Contenido de la base de conocimiento.', 'titulo:texto, cuerpo:texto, categoria:texto, publicado:booleano'),
    ],
    roles: [ADMIN, r('Agente', 'Atiende y resuelve tickets.', ['Responder y cambiar el estado de tickets', 'Crear artículos']), r('Supervisor', 'Controla la calidad del servicio.', ['Reasignar tickets', 'Ver reportes']), r('Solicitante', 'Crea y consulta sus tickets.', ['Crear tickets', 'Ver los propios'])],
    riesgos: [k('Recepción de tickets por email.', 'medio', 'Empezar con formulario web e incorporar email entrante como integración posterior.')],
  },
  {
    id: 'portal',
    label: 'Portal interno o de clientes',
    style: 'aplicacion',
    claves: ['portal', 'intranet', 'autogestion', 'administrativo', 'interno'],
    objetivos: ['Dar un punto de acceso único a información y trámites.', 'Reducir consultas repetitivas por otros canales.'],
    modulos: [
      m('Inicio y novedades', 'Comunicación y accesos rápidos.', ['Publicación de novedades', 'Accesos directos por perfil'], ['novedad', 'noticia', 'comunicado']),
      m('Solicitudes y trámites', 'Gestiones en línea.', ['Formularios de solicitud', 'Seguimiento del estado'], ['solicitud', 'tramite', 'gestion']),
      m('Documentos y recursos', 'Material disponible para consulta.', ['Biblioteca de documentos', 'Descargas por perfil'], ['documento', 'recurso', 'descarga']),
      m('Administración', 'Gestión de contenidos y usuarios.', ['Gestión de usuarios y perfiles', 'Gestión de contenidos'], ['administracion']),
    ],
    entidades: [
      e('Publicacion', 'Novedad o comunicado.', 'titulo:texto, cuerpo:texto, publicada_en:fecha y hora, autor_id:uuid'),
      e('Solicitud', 'Trámite iniciado por un usuario.', 'tipo:texto, estado:enum, datos:json, usuario_id:uuid'),
      e('Recurso', 'Documento o enlace disponible.', 'titulo:texto, archivo:texto, categoria:texto, visible_para:lista'),
    ],
    roles: [ADMIN, r('Gestor', 'Publica contenidos y resuelve solicitudes.', ['Publicar novedades y recursos', 'Resolver solicitudes']), r('Usuario', 'Consulta y realiza trámites.', ['Ver contenidos', 'Crear solicitudes'])],
    riesgos: [k('Contenido desactualizado.', 'bajo', 'Responsables por sección y fechas de revisión.')],
  },
  {
    id: 'proyectos',
    label: 'Sistema de gestión de proyectos',
    style: 'aplicacion',
    claves: ['proyecto', 'gantt', 'cronograma', 'hito', 'entregable', 'portafolio', 'roadmap', 'recurso', 'horas', 'avance', 'riesgo'],
    objetivos: ['Planificar proyectos con tareas, responsables y fechas.', 'Detectar desvíos de cronograma y presupuesto a tiempo.', 'Dar visibilidad del avance a todos los interesados.'],
    modulos: [
      m('Proyectos y portafolio', 'Ficha de cada proyecto y vista consolidada.', ['Alta de proyectos con objetivos, fechas y responsable', 'Estados y semáforo de salud', 'Vista de portafolio'], ['proyecto', 'portafolio']),
      m('Tareas y cronograma', 'Planificación detallada.', ['Tareas y subtareas con responsables', 'Dependencias e hitos', 'Diagrama de Gantt', 'Calendario'], ['tarea', 'gantt', 'cronograma', 'hito', 'calendario', 'dependencia']),
      m('Recursos y horas', 'Asignación y dedicación.', ['Asignación de personas por proyecto', 'Registro de horas trabajadas', 'Carga de trabajo por persona'], ['recurso', 'hora', 'equipo', 'asignacion']),
      m('Presupuesto y riesgos', 'Control económico y de riesgos.', ['Presupuesto por proyecto y partidas', 'Costo real vs. planificado', 'Registro de riesgos con probabilidad e impacto'], ['presupuesto', 'costo', 'riesgo']),
      m('Tablero de avance', 'Indicadores de cumplimiento.', ['Avance por proyecto', 'Tareas atrasadas', 'Desvíos de cronograma'], ['tablero', 'avance', 'indicador', 'cumplimiento']),
    ],
    entidades: [
      e('Proyecto', 'Iniciativa con alcance, plazo y responsable.', 'nombre:texto, objetivo:texto, estado:enum, inicio:fecha, fin_previsto:fecha, presupuesto:decimal, responsable_id:uuid', ['Tiene muchas Tareas, Hitos y Riesgos']),
      e('Tarea', 'Unidad de trabajo.', 'titulo:texto, estado:enum, prioridad:enum, inicio:fecha, vencimiento:fecha, avance:entero, proyecto_id:uuid, responsable_id:uuid, tarea_padre_id:uuid', ['Pertenece a un Proyecto', 'Puede depender de otras Tareas']),
      e('Hito', 'Fecha clave o entregable.', 'nombre:texto, fecha:fecha, cumplido:booleano, proyecto_id:uuid'),
      e('RegistroHoras', 'Tiempo dedicado a una tarea.', 'fecha:fecha, horas:decimal, nota:texto, tarea_id:uuid, usuario_id:uuid'),
      e('Riesgo', 'Evento que puede afectar al proyecto.', 'descripcion:texto, probabilidad:enum, impacto:enum, mitigacion:texto, estado:enum, proyecto_id:uuid'),
    ],
    roles: [ADMIN, r('Jefe de proyecto', 'Planifica y controla sus proyectos.', ['Crear y editar proyectos, tareas e hitos', 'Asignar recursos', 'Gestionar riesgos y presupuesto']), r('Miembro del equipo', 'Ejecuta tareas.', ['Actualizar sus tareas', 'Registrar horas']), r('Interesado', 'Sigue el avance.', ['Ver tableros y reportes'])],
    riesgos: [k('Complejidad del diagrama de Gantt con dependencias.', 'medio', 'Primera versión con dependencias simples (fin a inicio) y recálculo de fechas controlado.'), k('Datos de avance desactualizados.', 'medio', 'Actualización rápida de tareas y recordatorios periódicos.')],
  },
  {
    id: 'kanban',
    label: 'Gestión de tareas con tablero Kanban',
    style: 'aplicacion',
    claves: ['kanban', 'tablero', 'tarjeta', 'tarea', 'pendiente', 'to-do', 'columna'],
    objetivos: ['Visualizar el trabajo en curso de un vistazo.', 'Limitar el trabajo simultáneo para terminar antes.', 'Coordinar al equipo sin reuniones adicionales.'],
    modulos: [
      m('Tableros y columnas', 'Estructura del flujo de trabajo.', ['Tableros por equipo o proyecto', 'Columnas configurables', 'Límites de trabajo en curso'], ['tablero', 'columna']),
      m('Tarjetas', 'Tareas con todo su detalle.', ['Arrastrar y soltar entre columnas', 'Responsables, etiquetas y vencimiento', 'Listas de verificación y adjuntos'], ['tarjeta', 'tarea']),
      m('Colaboración', 'Comunicación sobre cada tarea.', ['Comentarios y menciones', 'Historial de actividad'], ['comentario', 'mencion', 'colabor']),
      m('Métricas de flujo', 'Indicadores del tablero.', ['Tareas por estado', 'Tiempo de ciclo'], ['metrica', 'tiempo de ciclo']),
    ],
    entidades: [
      e('Tablero', 'Espacio de trabajo visual.', 'nombre:texto, descripcion:texto', ['Tiene muchas Columnas']),
      e('Columna', 'Estado del flujo.', 'nombre:texto, orden:entero, limite_wip:entero, tablero_id:uuid'),
      e('Tarjeta', 'Tarea.', 'titulo:texto, descripcion:texto, orden:entero, vencimiento:fecha, etiquetas:lista, columna_id:uuid, responsable_id:uuid', ['Pertenece a una Columna', 'Tiene muchos Comentarios']),
      e('Comentario', 'Mensaje en una tarjeta.', 'cuerpo:texto, tarjeta_id:uuid, autor_id:uuid'),
    ],
    roles: [ADMIN, r('Miembro', 'Trabaja sobre los tableros.', ['Crear y mover tarjetas', 'Comentar']), r('Observador', 'Sólo lectura.', ['Ver tableros'])],
    riesgos: [k('Orden y movimientos simultáneos de tarjetas.', 'medio', 'Ordenamiento con posiciones fraccionarias y actualización optimista con reconciliación.')],
  },
  {
    id: 'scrum',
    label: 'Gestión ágil con Scrum',
    style: 'aplicacion',
    claves: ['scrum', 'sprint', 'backlog', 'agil', 'agile', 'historia de usuario', 'burndown', 'epica'],
    objetivos: ['Ordenar el backlog según el valor para el negocio.', 'Planificar y seguir sprints con compromisos claros.', 'Medir la velocidad del equipo para planificar mejor.'],
    modulos: [
      m('Backlog', 'Lista priorizada de trabajo.', ['Historias de usuario y épicas', 'Estimación en puntos', 'Priorización por arrastre'], ['backlog', 'historia', 'epica']),
      m('Sprints', 'Planificación y cierre de iteraciones.', ['Creación de sprints con objetivo y fechas', 'Planificación desde el backlog', 'Cierre con traspaso de pendientes'], ['sprint', 'iteracion']),
      m('Tablero del sprint', 'Seguimiento diario.', ['Tablero por estados', 'Tareas por historia', 'Impedimentos'], ['tablero', 'daily', 'impedimento']),
      m('Métricas ágiles', 'Indicadores del equipo.', ['Burndown del sprint', 'Velocidad por sprint'], ['burndown', 'velocidad', 'metrica']),
    ],
    entidades: [
      e('Epica', 'Agrupador de historias.', 'titulo:texto, descripcion:texto, estado:enum'),
      e('HistoriaUsuario', 'Requerimiento desde el punto de vista del usuario.', 'titulo:texto, descripcion:texto, criterios:texto, puntos:entero, estado:enum, prioridad:entero, epica_id:uuid, sprint_id:uuid'),
      e('Sprint', 'Iteración de trabajo.', 'nombre:texto, objetivo:texto, inicio:fecha, fin:fecha, estado:enum', ['Tiene muchas Historias']),
      e('Tarea', 'Trabajo técnico de una historia.', 'titulo:texto, estado:enum, horas_estimadas:decimal, historia_id:uuid, responsable_id:uuid'),
    ],
    roles: [ADMIN, r('Product Owner', 'Prioriza el backlog.', ['Crear y priorizar historias', 'Aceptar historias terminadas']), r('Scrum Master', 'Facilita el proceso.', ['Gestionar sprints', 'Registrar impedimentos']), r('Equipo de desarrollo', 'Construye el producto.', ['Estimar historias', 'Actualizar tareas'])],
    riesgos: [k('Prácticas ágiles distintas en cada equipo.', 'bajo', 'Estados y campos configurables en lugar de un flujo rígido.')],
  },
  {
    id: 'okr',
    label: 'Seguimiento de OKR y KPI',
    style: 'aplicacion',
    claves: ['okr', 'kpi', 'objetivo', 'resultado clave', 'indicador', 'meta', 'cumplimiento'],
    objetivos: ['Alinear los objetivos de equipos y personas con los de la organización.', 'Medir el avance con datos y no con percepciones.', 'Revisar el cumplimiento con una cadencia fija.'],
    modulos: [
      m('Objetivos y resultados clave', 'Definición por período.', ['Objetivos por organización, equipo y persona', 'Resultados clave medibles', 'Alineación entre niveles'], ['objetivo', 'okr', 'resultado clave']),
      m('Indicadores y mediciones', 'Catálogo de KPI y valores.', ['Definición de indicadores con fórmula y meta', 'Carga manual o importada de mediciones', 'Semáforo de cumplimiento'], ['kpi', 'indicador', 'medicion', 'meta']),
      m('Seguimientos periódicos', 'Actualizaciones de avance.', ['Actualización periódica con comentario', 'Nivel de confianza'], ['check-in', 'seguimiento', 'revision']),
      m('Tablero de cumplimiento', 'Vista ejecutiva.', ['Avance por objetivo y equipo', 'Evolución de indicadores'], ['tablero', 'cumplimiento', 'dashboard']),
    ],
    entidades: [
      e('Objetivo', 'Meta cualitativa de un período.', 'titulo:texto, periodo:texto, nivel:enum, avance:decimal, responsable_id:uuid, objetivo_padre_id:uuid', ['Tiene muchos Resultados clave']),
      e('ResultadoClave', 'Medida de éxito de un objetivo.', 'descripcion:texto, valor_inicial:decimal, valor_meta:decimal, valor_actual:decimal, unidad:texto, objetivo_id:uuid'),
      e('Indicador', 'KPI de seguimiento continuo.', 'nombre:texto, formula:texto, unidad:texto, meta:decimal, frecuencia:enum'),
      e('Medicion', 'Valor de un indicador en una fecha.', 'fecha:fecha, valor:decimal, comentario:texto, indicador_id:uuid'),
    ],
    roles: [ADMIN, r('Responsable de objetivo', 'Define y actualiza sus objetivos.', ['Crear objetivos y resultados clave', 'Registrar avances']), r('Dirección', 'Consulta el cumplimiento general.', ['Ver tableros de toda la organización'])],
    riesgos: [k('Indicadores sin fuente de datos confiable.', 'medio', 'Cada indicador declara su fuente y responsable de carga.')],
  },
  {
    id: 'analitica',
    label: 'Plataforma de analítica y dashboards',
    style: 'datos',
    claves: ['dashboard', 'business intelligence', 'bi', 'analitica', 'analisis de datos', 'visualizacion', 'grafico', 'reporte', 'indicador', 'metrica', 'sql'],
    objetivos: ['Convertir datos dispersos en indicadores confiables.', 'Permitir explorar la información sin depender de planillas.', 'Compartir reportes actualizados con quienes deciden.'],
    modulos: [
      m('Fuentes de datos', 'Conexión e importación.', ['Importación de Excel y CSV con vista previa', 'Conexión a bases de datos', 'Detección de tipos y validación'], ['fuente', 'importar', 'excel', 'csv', 'base de datos']),
      m('Modelo y métricas', 'Definición de lo que se mide.', ['Relaciones entre tablas', 'Métricas y dimensiones reutilizables', 'Documentación de cada cálculo'], ['modelo', 'metrica', 'dimension']),
      m('Dashboards interactivos', 'Visualización y exploración.', ['Tarjetas KPI, barras, líneas y tablas', 'Filtros que afectan a varios gráficos', 'Diseño adaptable'], ['dashboard', 'grafico', 'visualizacion', 'tablero', 'kpi']),
      m('Reportes y exportación', 'Distribución de resultados.', ['Exportación a PDF, Excel y CSV', 'Reportes programados'], ['reporte', 'informe', 'exportar', 'pdf']),
    ],
    entidades: [
      e('FuenteDatos', 'Origen de información.', 'nombre:texto, tipo:enum, configuracion:json, ultima_actualizacion:fecha y hora'),
      e('Dataset', 'Tabla disponible para análisis.', 'nombre:texto, filas:entero, columnas:json, fuente_id:uuid', ['Proviene de una Fuente']),
      e('Metrica', 'Cálculo definido sobre un dataset.', 'nombre:texto, expresion:texto, formato:texto, dataset_id:uuid'),
      e('Dashboard', 'Conjunto de visualizaciones.', 'titulo:texto, descripcion:texto, filtros:json, autor_id:uuid', ['Tiene muchos Widgets']),
      e('Widget', 'Visualización individual.', 'tipo:enum, titulo:texto, configuracion:json, posicion:json, dashboard_id:uuid'),
    ],
    roles: [ADMIN, r('Analista', 'Prepara datos y construye dashboards.', ['Conectar fuentes', 'Definir métricas', 'Crear y editar dashboards']), r('Lector', 'Consulta dashboards y reportes.', ['Ver y filtrar dashboards', 'Exportar'])],
    riesgos: [k('Calidad e inconsistencia de los datos de origen.', 'alto', 'Perfilado al importar, reglas de validación y avisos visibles de datos faltantes.'), k('Indicadores que no pueden calcularse con los datos disponibles.', 'medio', 'Sólo se ofrecen métricas respaldadas por columnas existentes; el resto se informa como pendiente.'), k('Rendimiento con grandes volúmenes.', 'medio', 'Agregaciones en la base de datos, paginación y resultados en caché.')],
  },
  {
    id: 'datos',
    label: 'Plataforma de ingeniería y gestión de datos',
    style: 'datos',
    claves: ['etl', 'elt', 'pipeline', 'data warehouse', 'almacen de datos', 'calidad de datos', 'catalogo de datos', 'ingesta', 'transformacion', 'integracion de datos'],
    objetivos: ['Automatizar la obtención y transformación de datos.', 'Garantizar la calidad y trazabilidad de la información.', 'Dejar los datos listos para análisis y reportes.'],
    modulos: [
      m('Conectores e ingesta', 'Obtención desde las fuentes.', ['Conectores a archivos, bases de datos y APIs', 'Cargas completas e incrementales', 'Registro de procedencia'], ['conector', 'ingesta', 'fuente', 'extraccion']),
      m('Transformaciones', 'Limpieza y modelado.', ['Pasos de limpieza, uniones y agregaciones', 'Vista previa de resultados intermedios', 'Recetas reutilizables y versionadas'], ['transformacion', 'limpieza', 'etl']),
      m('Orquestación y monitoreo', 'Ejecución programada y control.', ['Pipelines con pasos encadenados', 'Programación de ejecuciones', 'Logs, reintentos y alertas'], ['pipeline', 'orquestacion', 'programacion', 'monitoreo']),
      m('Calidad y catálogo', 'Reglas y documentación de datos.', ['Reglas de completitud, unicidad y validez', 'Puntaje de calidad por tabla', 'Catálogo con descripción de columnas'], ['calidad', 'catalogo', 'regla']),
    ],
    entidades: [
      e('Fuente', 'Sistema o archivo de origen.', 'nombre:texto, tipo:enum, configuracion:json'),
      e('Pipeline', 'Flujo de procesamiento.', 'nombre:texto, definicion:json, programacion:texto, activo:booleano', ['Tiene muchas Ejecuciones']),
      e('Ejecucion', 'Corrida de un pipeline.', 'estado:enum, inicio:fecha y hora, fin:fecha y hora, filas_procesadas:entero, error:texto, pipeline_id:uuid'),
      e('ReglaCalidad', 'Validación sobre una tabla.', 'tipo:enum, columna:texto, parametros:json, tabla_id:uuid'),
      e('Tabla', 'Conjunto de datos resultante.', 'nombre:texto, esquema:json, descripcion:texto, filas:entero'),
    ],
    roles: [ADMIN, r('Ingeniero de datos', 'Construye y mantiene pipelines.', ['Crear conectores y pipelines', 'Definir reglas de calidad']), r('Analista', 'Consume los datos preparados.', ['Consultar tablas y catálogo'])],
    riesgos: [k('Cambios de estructura en las fuentes.', 'alto', 'Validación de esquema en cada ejecución y alertas ante cambios.'), k('Ejecución de transformaciones pesadas.', 'medio', 'Procesamiento por lotes en procesos aislados con límites de memoria y tiempo.'), k('Credenciales de acceso a fuentes externas.', 'alto', 'Almacenamiento cifrado en el servidor; nunca en el navegador ni en el código.')],
  },
  {
    id: 'predictivo',
    label: 'Aplicación de analítica predictiva',
    style: 'datos',
    claves: ['predic', 'pronostico', 'forecast', 'machine learning', 'modelo predictivo', 'estimar', 'proyeccion', 'anomalia', 'clasificacion', 'clustering'],
    objetivos: ['Anticipar resultados a partir de datos históricos.', 'Medir la confiabilidad de cada predicción.', 'Poner las predicciones al alcance de quienes deciden.'],
    modulos: [
      m('Preparación de datos', 'Conjunto de entrenamiento.', ['Importación y limpieza de históricos', 'Selección de variables', 'División entrenamiento / validación'], ['dato', 'historico', 'variable']),
      m('Entrenamiento y evaluación', 'Construcción y medición de modelos.', ['Entrenamiento con algoritmos estándar', 'Métricas de calidad del modelo', 'Comparación de versiones'], ['entrenamiento', 'modelo', 'evaluacion']),
      m('Predicciones', 'Uso del modelo.', ['Predicción sobre nuevos datos', 'Intervalos de confianza', 'Visualización real vs. estimado'], ['prediccion', 'pronostico', 'forecast']),
      m('Monitoreo del modelo', 'Seguimiento en el tiempo.', ['Seguimiento del error', 'Aviso de pérdida de precisión'], ['monitoreo', 'precision']),
    ],
    entidades: [
      e('Dataset', 'Datos históricos.', 'nombre:texto, filas:entero, columnas:json, periodo:texto'),
      e('Modelo', 'Modelo entrenado.', 'nombre:texto, algoritmo:texto, version:entero, metricas:json, dataset_id:uuid'),
      e('Entrenamiento', 'Corrida de entrenamiento.', 'estado:enum, parametros:json, duracion:entero, modelo_id:uuid'),
      e('Prediccion', 'Resultado estimado.', 'fecha_objetivo:fecha, valor:decimal, intervalo:json, modelo_id:uuid'),
    ],
    roles: [ADMIN, r('Científico de datos', 'Prepara datos y entrena modelos.', ['Crear datasets y modelos', 'Publicar versiones']), r('Usuario de negocio', 'Consulta predicciones.', ['Ver predicciones y su confiabilidad'])],
    riesgos: [k('Historial insuficiente o de baja calidad para predecir.', 'alto', 'Evaluar los datos antes de comprometer resultados y mostrar siempre las métricas del modelo.'), k('Interpretar correlaciones como causas.', 'medio', 'Presentar las predicciones con su margen de error y sus limitaciones.'), k('Ejecución de entrenamientos costosos.', 'medio', 'Procesos aislados con límites de recursos y ejecución asíncrona.')],
  },
  {
    id: 'saas',
    label: 'Plataforma SaaS multi-organización',
    style: 'aplicacion',
    claves: ['saas', 'multi-tenant', 'multitenant', 'suscripcion', 'plan', 'tenant', 'software como servicio', 'membresia'],
    objetivos: ['Ofrecer el producto a varias organizaciones con datos aislados.', 'Gestionar planes y suscripciones sin intervención manual.', 'Reducir el tiempo de alta de cada nuevo cliente.'],
    modulos: [
      m('Organizaciones y cuentas', 'Espacios aislados por cliente.', ['Registro de organizaciones', 'Invitación de miembros', 'Aislamiento de datos por organización'], ['organizacion', 'cuenta', 'tenant', 'empresa']),
      m('Planes y suscripciones', 'Oferta comercial y cobro.', ['Planes con límites y funciones', 'Alta, cambio y baja de suscripción', 'Historial de facturación'], ['plan', 'suscripcion', 'facturacion', 'precio']),
      m('Onboarding y configuración', 'Primeros pasos del cliente.', ['Asistente de configuración inicial', 'Personalización por organización'], ['onboarding', 'configuracion', 'bienvenida']),
      m('Panel de administración', 'Operación de la plataforma.', ['Listado de organizaciones y uso', 'Soporte y suspensión de cuentas'], ['administracion', 'backoffice']),
    ],
    entidades: [
      e('Organizacion', 'Cliente de la plataforma.', 'nombre:texto, identificador:texto, estado:enum, plan_id:uuid', ['Tiene muchos Usuarios', 'Tiene una Suscripción']),
      e('Membresia', 'Vínculo entre usuario y organización.', 'rol:enum, usuario_id:uuid, organizacion_id:uuid'),
      e('Plan', 'Nivel de servicio.', 'nombre:texto, precio:decimal, periodo:enum, limites:json'),
      e('Suscripcion', 'Contratación vigente.', 'estado:enum, inicio:fecha, renovacion:fecha, organizacion_id:uuid, plan_id:uuid'),
    ],
    roles: [r('Operador de la plataforma', 'Administra todas las organizaciones.', ['Ver y gestionar todas las organizaciones', 'Configurar planes']), r('Propietario de la organización', 'Administra su espacio.', ['Gestionar miembros y suscripción', 'Configurar la organización']), r('Miembro', 'Usa el producto.', ['Acceso según el rol asignado'])],
    riesgos: [k('Fuga de datos entre organizaciones.', 'alto', 'Filtro obligatorio por organización en la capa de acceso a datos y pruebas automatizadas de aislamiento.'), k('Integración con la pasarela de pagos.', 'medio', 'Delegar el cobro en un proveedor especializado y sincronizar estados por webhooks.')],
  },
  {
    id: 'marketplace',
    label: 'Marketplace',
    style: 'aplicacion',
    claves: ['marketplace', 'vendedores y compradores', 'publicacion', 'comision', 'oferentes'],
    objetivos: ['Conectar a quienes ofrecen con quienes buscan.', 'Generar confianza entre las partes.', 'Cobrar una comisión por cada operación.'],
    modulos: [
      m('Catálogo de publicaciones', 'Oferta disponible.', ['Publicación con fotos, precio y categoría', 'Búsqueda y filtros', 'Ficha de publicación'], ['publicacion', 'catalogo', 'anuncio']),
      m('Vendedores', 'Perfiles y gestión de la oferta.', ['Registro y verificación de vendedores', 'Panel del vendedor'], ['vendedor', 'oferente', 'tienda']),
      m('Pedidos y pagos', 'Operación entre las partes.', ['Compra con pago en línea', 'Comisión de la plataforma', 'Estados del pedido'], ['pedido', 'pago', 'comision', 'compra']),
      m('Reputación y moderación', 'Confianza y control.', ['Reseñas y calificaciones', 'Reporte y moderación de publicaciones'], ['resena', 'calificacion', 'moderacion', 'reputacion']),
    ],
    entidades: [
      e('Vendedor', 'Quien ofrece productos o servicios.', 'nombre:texto, verificado:booleano, calificacion:decimal, usuario_id:uuid'),
      e('Publicacion', 'Producto o servicio ofrecido.', 'titulo:texto, descripcion:texto, precio:decimal, categoria:texto, estado:enum, vendedor_id:uuid'),
      e('Pedido', 'Operación de compra.', 'estado:enum, total:decimal, comision:decimal, comprador_id:uuid, publicacion_id:uuid'),
      e('Resena', 'Opinión posterior a la compra.', 'puntaje:entero, comentario:texto, pedido_id:uuid'),
    ],
    roles: [ADMIN, r('Vendedor', 'Publica y gestiona sus ventas.', ['Crear publicaciones', 'Gestionar pedidos recibidos']), r('Comprador', 'Busca y compra.', ['Comprar', 'Calificar'])],
    riesgos: [k('Pagos divididos entre plataforma y vendedores.', 'alto', 'Usar un proveedor de pagos con soporte para marketplaces.'), k('Publicaciones fraudulentas.', 'medio', 'Verificación de vendedores, reportes y moderación.')],
  },
  {
    id: 'ecommerce',
    label: 'Tienda en línea',
    style: 'aplicacion',
    claves: ['e-commerce', 'ecommerce', 'tienda', 'carrito', 'checkout', 'venta online', 'venta en linea', 'envio'],
    objetivos: ['Vender en línea con una experiencia de compra simple.', 'Gestionar pedidos y stock desde un solo lugar.', 'Conocer qué se vende y a quién.'],
    modulos: [
      m('Catálogo', 'Productos y categorías.', ['Productos con variantes, fotos y stock', 'Categorías y búsqueda', 'Precios y promociones'], ['catalogo', 'producto', 'categoria']),
      m('Carrito y checkout', 'Proceso de compra.', ['Carrito persistente', 'Datos de envío y pago', 'Confirmación por email'], ['carrito', 'checkout', 'compra']),
      m('Pedidos y envíos', 'Gestión posterior a la venta.', ['Estados del pedido', 'Costos y seguimiento de envío'], ['pedido', 'envio', 'entrega']),
      m('Administración de la tienda', 'Operación diaria.', ['Gestión de productos y stock', 'Listado de pedidos y clientes', 'Reportes de ventas'], ['administracion', 'backoffice']),
    ],
    entidades: [
      e('Producto', 'Artículo en venta.', 'nombre:texto, descripcion:texto, precio:decimal, stock:entero, imagenes:lista, categoria_id:uuid'),
      e('Categoria', 'Agrupador de productos.', 'nombre:texto, categoria_padre_id:uuid'),
      e('Cliente', 'Comprador.', 'nombre:texto, email:texto, direccion:json'),
      e('Pedido', 'Compra realizada.', 'numero:texto, estado:enum, total:decimal, envio:json, cliente_id:uuid', ['Tiene muchos Ítems']),
      e('ItemPedido', 'Línea de un pedido.', 'cantidad:entero, precio_unitario:decimal, pedido_id:uuid, producto_id:uuid'),
    ],
    roles: [ADMIN, r('Operador de tienda', 'Gestiona catálogo y pedidos.', ['Editar productos y stock', 'Procesar pedidos']), r('Cliente', 'Compra en la tienda.', ['Comprar', 'Ver sus pedidos'])],
    riesgos: [k('Integración con medios de pago y envíos locales.', 'alto', 'Elegir proveedores con buena cobertura en el país y probar el flujo completo en modo de prueba.'), k('Sobreventa por stock desactualizado.', 'medio', 'Descuento de stock dentro de la transacción del pedido.')],
  },
  {
    id: 'reservas',
    label: 'Sistema de reservas y turnos',
    style: 'aplicacion',
    claves: ['reserva', 'turno', 'cita', 'agenda', 'booking', 'disponibilidad', 'calendario'],
    objetivos: ['Permitir reservar en línea a cualquier hora.', 'Evitar superposiciones y ausencias.', 'Reducir el tiempo dedicado a coordinar turnos.'],
    modulos: [
      m('Disponibilidad y agenda', 'Horarios y recursos reservables.', ['Servicios, profesionales o espacios', 'Horarios de atención y bloqueos', 'Vista de agenda'], ['disponibilidad', 'agenda', 'horario']),
      m('Reservas', 'Toma y gestión de turnos.', ['Reserva en línea con confirmación', 'Reprogramación y cancelación', 'Control de superposiciones'], ['reserva', 'turno', 'cita']),
      m('Clientes y recordatorios', 'Comunicación con quienes reservan.', ['Ficha del cliente con historial', 'Recordatorios automáticos'], ['cliente', 'paciente', 'recordatorio']),
      m('Pagos y cancelaciones', 'Reglas económicas.', ['Seña o pago anticipado', 'Política de cancelación'], ['pago', 'sena', 'cancelacion']),
    ],
    entidades: [
      e('Servicio', 'Prestación o recurso reservable.', 'nombre:texto, duracion_min:entero, precio:decimal, activo:booleano'),
      e('Disponibilidad', 'Franja horaria habilitada.', 'dia_semana:entero, desde:hora, hasta:hora, servicio_id:uuid'),
      e('Reserva', 'Turno tomado.', 'inicio:fecha y hora, fin:fecha y hora, estado:enum, notas:texto, servicio_id:uuid, cliente_id:uuid', ['Pertenece a un Servicio y a un Cliente']),
      e('Cliente', 'Persona que reserva.', 'nombre:texto, email:texto, telefono:texto'),
    ],
    roles: [ADMIN, r('Recepción', 'Gestiona la agenda.', ['Crear, mover y cancelar reservas']), r('Cliente', 'Reserva en línea.', ['Reservar', 'Cancelar o reprogramar sus turnos'])],
    riesgos: [k('Reservas simultáneas del mismo horario.', 'alto', 'Restricción en la base de datos que impide superposiciones.'), k('Zonas horarias y cambios de horario.', 'medio', 'Guardar fechas en UTC y mostrar en la zona del negocio.')],
  },
  {
    id: 'lms',
    label: 'Plataforma de aprendizaje (LMS)',
    style: 'aplicacion',
    claves: ['lms', 'curso', 'capacitacion', 'aprendizaje', 'alumno', 'estudiante', 'leccion', 'e-learning', 'certificado'],
    objetivos: ['Publicar cursos y contenidos de forma ordenada.', 'Seguir el progreso de cada estudiante.', 'Evaluar y certificar lo aprendido.'],
    modulos: [
      m('Cursos y contenidos', 'Estructura del material.', ['Cursos con módulos y lecciones', 'Video, texto y archivos', 'Publicación por etapas'], ['curso', 'leccion', 'contenido']),
      m('Inscripciones y progreso', 'Recorrido del estudiante.', ['Inscripción abierta o por invitación', 'Avance por lección', 'Retomar donde quedó'], ['inscripcion', 'progreso', 'avance']),
      m('Evaluaciones', 'Medición del aprendizaje.', ['Cuestionarios con corrección automática', 'Intentos y nota mínima'], ['evaluacion', 'examen', 'cuestionario']),
      m('Certificados', 'Constancia de finalización.', ['Emisión automática al aprobar', 'Verificación por código'], ['certificado', 'constancia']),
    ],
    entidades: [
      e('Curso', 'Unidad de formación.', 'titulo:texto, descripcion:texto, estado:enum, instructor_id:uuid', ['Tiene muchas Lecciones']),
      e('Leccion', 'Contenido individual.', 'titulo:texto, tipo:enum, contenido:texto, orden:entero, curso_id:uuid'),
      e('Inscripcion', 'Estudiante en un curso.', 'estado:enum, progreso:decimal, finalizado_en:fecha y hora, curso_id:uuid, estudiante_id:uuid'),
      e('Evaluacion', 'Cuestionario de un curso.', 'titulo:texto, preguntas:json, nota_minima:decimal, curso_id:uuid'),
    ],
    roles: [ADMIN, r('Instructor', 'Crea y dicta cursos.', ['Crear cursos y evaluaciones', 'Ver el progreso de sus estudiantes']), r('Estudiante', 'Realiza cursos.', ['Inscribirse', 'Cursar y rendir evaluaciones'])],
    riesgos: [k('Almacenamiento y reproducción de video.', 'medio', 'Usar un servicio de video especializado en lugar de servir archivos propios.')],
  },
  {
    id: 'comunidad',
    label: 'Plataforma de comunidad y membresías',
    style: 'aplicacion',
    claves: ['comunidad', 'foro', 'miembro', 'membresia', 'red social', 'grupo', 'evento', 'publicacion'],
    objetivos: ['Dar a los miembros un espacio propio para participar.', 'Fomentar la interacción entre pares.', 'Mantener un ambiente cuidado mediante moderación.'],
    modulos: [
      m('Perfiles de miembros', 'Identidad dentro de la comunidad.', ['Perfil con foto y presentación', 'Directorio de miembros'], ['perfil', 'miembro']),
      m('Publicaciones y debates', 'Conversación.', ['Publicaciones con comentarios y reacciones', 'Temas y etiquetas'], ['publicacion', 'debate', 'foro', 'comentario']),
      m('Grupos y eventos', 'Espacios y encuentros.', ['Grupos por interés', 'Eventos con inscripción'], ['grupo', 'evento']),
      m('Moderación', 'Cuidado de la comunidad.', ['Reporte de contenido', 'Herramientas de moderación'], ['moderacion', 'reporte']),
    ],
    entidades: [
      e('Miembro', 'Integrante de la comunidad.', 'nombre:texto, presentacion:texto, nivel:enum, usuario_id:uuid'),
      e('Publicacion', 'Mensaje en la comunidad.', 'titulo:texto, cuerpo:texto, etiquetas:lista, autor_id:uuid, grupo_id:uuid', ['Tiene muchos Comentarios']),
      e('Comentario', 'Respuesta a una publicación.', 'cuerpo:texto, publicacion_id:uuid, autor_id:uuid'),
      e('Grupo', 'Espacio temático.', 'nombre:texto, descripcion:texto, privado:booleano'),
    ],
    roles: [ADMIN, r('Moderador', 'Cuida las conversaciones.', ['Ocultar o eliminar contenido', 'Suspender miembros']), r('Miembro', 'Participa.', ['Publicar y comentar', 'Unirse a grupos'])],
    riesgos: [k('Contenido inapropiado o spam.', 'medio', 'Reportes, límites de publicación y herramientas de moderación desde el inicio.')],
  },
  {
    id: 'api',
    label: 'API y servicios de backend',
    style: 'api',
    claves: ['api', 'rest', 'graphql', 'backend', 'endpoint', 'microservicio', 'servicio web', 'autenticacion', 'webhook'],
    objetivos: ['Exponer datos y operaciones de forma segura y documentada.', 'Dar a los consumidores un contrato estable y versionado.', 'Monitorear el uso y la salud del servicio.'],
    modulos: [
      m('Recursos y endpoints', 'Operaciones del dominio.', ['Endpoints de consulta, alta, modificación y baja', 'Validación de entradas', 'Paginación, filtros y orden'], ['endpoint', 'recurso', 'crud']),
      m('Autenticación y claves', 'Control de acceso.', ['Claves de API por cliente', 'Tokens con vencimiento', 'Permisos por alcance'], ['autenticacion', 'token', 'clave', 'oauth']),
      m('Documentación', 'Contrato para consumidores.', ['Especificación OpenAPI', 'Ejemplos de uso', 'Registro de cambios por versión'], ['documentacion', 'openapi', 'swagger']),
      m('Observabilidad y límites', 'Operación confiable.', ['Logs estructurados y métricas', 'Límite de solicitudes por cliente', 'Chequeos de salud'], ['log', 'monitoreo', 'limite', 'rate']),
    ],
    entidades: [
      e('ClienteApi', 'Aplicación consumidora.', 'nombre:texto, contacto:texto, activo:booleano', ['Tiene muchas Claves']),
      e('ClaveApi', 'Credencial de acceso.', 'prefijo:texto, hash:texto, alcances:lista, vence_en:fecha y hora, cliente_id:uuid'),
      e('RegistroSolicitud', 'Traza de una llamada.', 'metodo:texto, ruta:texto, estado:entero, duracion_ms:entero, cliente_id:uuid'),
    ],
    roles: [ADMIN, r('Desarrollador consumidor', 'Integra su aplicación con la API.', ['Usar los endpoints permitidos por su clave'])],
    riesgos: [k('Cambios incompatibles para los consumidores.', 'alto', 'Versionado explícito y política de deprecación.'), k('Abuso o uso excesivo.', 'medio', 'Límites por clave y monitoreo de patrones anómalos.'), k('Exposición de datos por permisos mal definidos.', 'alto', 'Alcances mínimos por clave y pruebas de autorización automatizadas.')],
  },
  {
    id: 'integraciones',
    label: 'Plataforma de integraciones y automatización',
    style: 'api',
    claves: ['integracion', 'automatizacion', 'automatizar', 'webhook', 'conector', 'sincronizar', 'sincronizacion', 'zapier'],
    objetivos: ['Conectar sistemas que hoy no se comunican.', 'Eliminar tareas manuales repetitivas.', 'Tener trazabilidad de cada ejecución.'],
    modulos: [
      m('Conectores', 'Acceso a sistemas externos.', ['Catálogo de conectores', 'Credenciales cifradas', 'Prueba de conexión'], ['conector', 'conexion']),
      m('Flujos de automatización', 'Reglas disparador → acciones.', ['Disparadores por evento, horario o webhook', 'Pasos con condiciones y transformaciones', 'Versionado de flujos'], ['flujo', 'automatizacion', 'disparador', 'webhook']),
      m('Ejecuciones y reintentos', 'Procesamiento confiable.', ['Cola de ejecución', 'Reintentos con espera creciente', 'Reproceso manual'], ['ejecucion', 'reintento', 'cola']),
      m('Monitoreo', 'Visibilidad operativa.', ['Historial de ejecuciones', 'Alertas ante fallas'], ['monitoreo', 'alerta', 'log']),
    ],
    entidades: [
      e('Conector', 'Sistema externo configurado.', 'nombre:texto, tipo:texto, credenciales_cifradas:texto, estado:enum'),
      e('Flujo', 'Automatización definida.', 'nombre:texto, disparador:json, activo:booleano, version:entero', ['Tiene muchos Pasos']),
      e('Paso', 'Acción dentro de un flujo.', 'orden:entero, tipo:texto, configuracion:json, flujo_id:uuid, conector_id:uuid'),
      e('Ejecucion', 'Corrida de un flujo.', 'estado:enum, entrada:json, salida:json, error:texto, intentos:entero, flujo_id:uuid'),
    ],
    roles: [ADMIN, r('Constructor de flujos', 'Diseña automatizaciones.', ['Crear y editar flujos', 'Configurar conectores']), r('Operador', 'Supervisa las ejecuciones.', ['Ver ejecuciones', 'Reprocesar fallas'])],
    riesgos: [k('Límites y cambios en las APIs de terceros.', 'alto', 'Adaptadores por proveedor, reintentos y alertas ante errores.'), k('Ejecuciones duplicadas.', 'medio', 'Claves de idempotencia en cada paso.')],
  },
  {
    id: 'admin',
    label: 'Panel de administración y herramientas internas',
    style: 'aplicacion',
    claves: ['panel de administracion', 'admin panel', 'backoffice', 'herramienta interna', 'abm', 'base de datos', 'gestion de registros'],
    objetivos: ['Administrar los datos del negocio sin acceder a la base directamente.', 'Controlar quién puede ver y modificar cada cosa.', 'Dejar registro de cada cambio.'],
    modulos: [
      m('Explorador de datos', 'Consulta de registros.', ['Listados con búsqueda, filtros y orden', 'Vista de detalle con relaciones'], ['explorador', 'listado', 'consulta']),
      m('Alta, baja y modificación', 'Edición controlada.', ['Formularios con validación', 'Acciones masivas', 'Importación y exportación'], ['abm', 'edicion', 'formulario']),
      m('Usuarios y permisos', 'Control de acceso.', ['Roles con permisos por recurso', 'Gestión de usuarios'], ['usuario', 'permiso', 'rol']),
      m('Auditoría', 'Trazabilidad de cambios.', ['Registro de quién cambió qué y cuándo', 'Comparación antes / después'], ['auditoria', 'historial']),
    ],
    entidades: [
      e('Recurso', 'Tipo de dato administrable.', 'nombre:texto, esquema:json'),
      e('Registro', 'Fila de un recurso.', 'datos:json, recurso_id:uuid, modificado_por:uuid'),
      e('RegistroAuditoria', 'Traza de un cambio.', 'accion:enum, antes:json, despues:json, usuario_id:uuid, registro_id:uuid'),
    ],
    roles: [ADMIN, r('Operador', 'Consulta y edita registros permitidos.', ['Ver y editar los recursos asignados']), r('Consulta', 'Sólo lectura.', ['Ver registros'])],
    riesgos: [k('Modificaciones accidentales de datos productivos.', 'alto', 'Confirmación en acciones destructivas, auditoría y posibilidad de revertir.')],
  },
  {
    id: 'sitio',
    label: 'Sitio web institucional',
    style: 'sitio',
    claves: ['sitio web', 'pagina web', 'landing', 'portfolio', 'portafolio', 'institucional', 'corporativ', 'presencia online', 'website'],
    objetivos: ['Presentar con claridad quiénes son y qué ofrecen.', 'Convertir visitas en consultas.', 'Cargar rápido y verse bien en cualquier dispositivo.'],
    modulos: [
      m('Páginas principales', 'Contenido institucional.', ['Inicio con propuesta de valor', 'Servicios o productos', 'Quiénes somos'], ['inicio', 'servicio', 'nosotros', 'pagina']),
      m('Contacto', 'Canal de consultas.', ['Formulario con validación y protección anti-spam', 'Datos de contacto y mapa', 'Aviso por email de cada consulta'], ['contacto', 'formulario', 'consulta']),
      m('Posicionamiento y rendimiento', 'Visibilidad y velocidad.', ['Metadatos y datos estructurados', 'Imágenes optimizadas', 'Medición de visitas'], ['seo', 'posicionamiento', 'rendimiento', 'analitica']),
      m('Gestión de contenido', 'Actualización sin programar.', ['Edición de textos e imágenes', 'Vista previa antes de publicar'], ['contenido', 'editar', 'cms']),
    ],
    entidades: [
      e('Pagina', 'Página del sitio.', 'titulo:texto, ruta:texto, descripcion:texto, publicada:booleano', ['Tiene muchas Secciones']),
      e('Seccion', 'Bloque de contenido.', 'tipo:enum, contenido:json, orden:entero, pagina_id:uuid'),
      e('MensajeContacto', 'Consulta recibida.', 'nombre:texto, email:texto, mensaje:texto, leido:booleano'),
    ],
    roles: [r('Editor', 'Actualiza el contenido del sitio.', ['Editar páginas', 'Ver consultas recibidas'])],
    riesgos: [k('Contenido e imágenes definitivos no disponibles a tiempo.', 'medio', 'Definir responsables y fechas de entrega de contenido al inicio.'), k('Spam en el formulario de contacto.', 'bajo', 'Validación en el servidor y protección anti-spam.')],
  },
  {
    id: 'contenido',
    label: 'Plataforma de contenidos',
    style: 'sitio',
    claves: ['blog', 'cms', 'noticia', 'articulo', 'documentacion', 'editorial', 'publicar contenido', 'portal de noticias'],
    objetivos: ['Publicar contenido con un flujo editorial ordenado.', 'Facilitar que los lectores encuentren lo que buscan.', 'Mantener buen posicionamiento en buscadores.'],
    modulos: [
      m('Editor de contenidos', 'Creación y edición.', ['Editor con formato, imágenes y código', 'Borradores y vista previa', 'Historial de versiones'], ['editor', 'articulo', 'redaccion']),
      m('Organización', 'Estructura del contenido.', ['Categorías y etiquetas', 'Autores', 'Navegación jerárquica'], ['categoria', 'etiqueta', 'autor']),
      m('Publicación', 'Flujo editorial.', ['Estados borrador, revisión y publicado', 'Publicación programada'], ['publicacion', 'programar', 'revision']),
      m('Búsqueda y descubrimiento', 'Acceso al contenido.', ['Búsqueda de texto', 'Contenido relacionado', 'Canal RSS'], ['busqueda', 'buscar', 'rss']),
    ],
    entidades: [
      e('Articulo', 'Pieza de contenido.', 'titulo:texto, resumen:texto, cuerpo:texto, estado:enum, publicado_en:fecha y hora, autor_id:uuid, categoria_id:uuid'),
      e('Categoria', 'Agrupador temático.', 'nombre:texto, ruta:texto'),
      e('Autor', 'Quien firma el contenido.', 'nombre:texto, biografia:texto, usuario_id:uuid'),
      e('Medio', 'Imagen o archivo.', 'archivo:texto, texto_alternativo:texto, tipo:texto'),
    ],
    roles: [ADMIN, r('Editor', 'Revisa y publica.', ['Publicar y despublicar', 'Editar cualquier contenido']), r('Autor', 'Escribe contenido.', ['Crear y editar sus artículos'])],
    riesgos: [k('Migración de contenido existente.', 'medio', 'Importación asistida y redirecciones para conservar enlaces.')],
  },
  {
    id: 'personalizado',
    label: 'Aplicación a medida',
    style: 'aplicacion',
    claves: [],
    objetivos: ['Resolver el problema descripto con una solución hecha a medida.', 'Reemplazar tareas manuales por un flujo ordenado y trazable.'],
    modulos: [
      m('Gestión de registros principales', 'Alta, consulta y edición de la información central del sistema.', ['Listado con búsqueda y filtros', 'Formularios de alta y edición con validación', 'Vista de detalle'], []),
      m('Seguimiento de estados', 'Ciclo de vida de cada registro.', ['Estados configurables', 'Historial de cambios'], ['estado', 'seguimiento']),
    ],
    entidades: [e('Registro', 'Entidad central del sistema; su nombre y campos se definen al refinar el Blueprint.', 'nombre:texto, estado:enum, datos:json, responsable_id:uuid')],
    roles: [ADMIN, r('Usuario', 'Opera el sistema en el día a día.', ['Crear y editar los registros a su cargo'])],
    riesgos: [k('Requerimientos todavía generales.', 'medio', 'Refinar la especificación con casos de uso concretos antes de generar la aplicación.')],
  },
];

const archetypeIndex = new Map(ARCHETYPES.map((a) => [a.id, a]));
export const archetypeById = (id: string): Archetype => archetypeIndex.get(id) ?? archetypeIndex.get('personalizado')!;

// ---------- Capacidades transversales ----------

export interface Capability {
  id: string;
  modulo: ModuleDef;
  entidades: EntityDef[];
  /** Estilos de solución en los que se agrega aunque el usuario no la mencione. */
  implicitFor: SolutionStyle[];
  implicitReason: string;
}

export const CAPABILITIES: Capability[] = [
  {
    id: 'auth',
    modulo: m('Autenticación y permisos', 'Acceso seguro y control de lo que puede hacer cada persona.', ['Inicio de sesión seguro', 'Roles y permisos por módulo', 'Recuperación de contraseña', 'Gestión de usuarios'], ['login', 'inicio de sesion', 'iniciar sesion', 'usuarios', 'rol(es)?\\b', 'permiso', 'autenticacion', 'contrasena', 'acceso']),
    entidades: [
      e('Usuario', 'Persona con acceso al sistema.', 'nombre:texto, email:texto, hash_contrasena:texto, activo:booleano, rol_id:uuid', ['Tiene un Rol']),
      e('Rol', 'Conjunto de permisos.', 'nombre:texto, permisos:lista'),
    ],
    implicitFor: ['aplicacion', 'datos'],
    implicitReason: 'Una aplicación con datos de la organización necesita identificar a quien la usa y limitar accesos.',
  },
  {
    id: 'panel',
    modulo: m('Panel de indicadores', 'Resumen visual del estado general al ingresar.', ['Tarjetas con indicadores clave', 'Gráficos de evolución', 'Accesos rápidos a pendientes'], ['dashboard', 'tablero', 'indicador', 'kpi\\b', 'metrica', 'grafico', 'estadistica']),
    entidades: [],
    implicitFor: ['aplicacion'],
    implicitReason: 'Un panel inicial permite ver el estado general sin recorrer cada módulo.',
  },
  {
    id: 'reportes',
    modulo: m('Reportes y exportación', 'Salida de información para análisis y presentación.', ['Reportes filtrables por período', 'Exportación a Excel, CSV y PDF'], ['reporte', 'informe', 'exportar', 'exportacion', 'excel', 'pdf\\b', 'csv\\b', 'descargar']),
    entidades: [],
    implicitFor: ['datos'],
    implicitReason: 'Las soluciones de datos necesitan compartir resultados fuera de la aplicación.',
  },
  {
    id: 'notificaciones',
    modulo: m('Notificaciones', 'Avisos a las personas indicadas en el momento oportuno.', ['Notificaciones dentro de la aplicación', 'Avisos por email', 'Preferencias por usuario'], ['notificacion', 'notificar', 'alerta', 'recordatorio', 'aviso', 'email', 'correo', 'whatsapp', 'sms\\b']),
    entidades: [e('Notificacion', 'Aviso dirigido a un usuario.', 'tipo:texto, mensaje:texto, leida:booleano, usuario_id:uuid')],
    implicitFor: [],
    implicitReason: '',
  },
  {
    id: 'api',
    modulo: m('API de integración', 'Acceso programático para conectar con otros sistemas.', ['Endpoints documentados', 'Autenticación por clave', 'Webhooks de eventos'], ['api\\b', 'integracion', 'integrar', 'webhook', 'conectar con', 'sincronizar']),
    entidades: [],
    implicitFor: [],
    implicitReason: '',
  },
  {
    id: 'pagos',
    modulo: m('Pagos en línea', 'Cobro mediante una pasarela de pagos.', ['Integración con pasarela de pagos', 'Registro de transacciones', 'Conciliación de cobros'], ['pago en linea', 'pago online', 'pasarela', 'tarjeta', 'cobrar', 'checkout', 'stripe', 'mercado pago', 'paypal', 'bancard']),
    entidades: [e('Transaccion', 'Operación de cobro.', 'monto:decimal, moneda:texto, estado:enum, referencia_externa:texto')],
    implicitFor: [],
    implicitReason: '',
  },
  {
    id: 'archivos',
    modulo: m('Archivos adjuntos', 'Carga y consulta de documentos e imágenes asociados a los registros.', ['Carga de archivos con validación de tipo y tamaño', 'Vista previa y descarga'], ['adjunt', 'subir archivo', 'cargar archivo', 'imagen', 'foto', 'documento']),
    entidades: [e('ArchivoAdjunto', 'Archivo asociado a un registro.', 'nombre:texto, tipo:texto, tamano:entero, ruta:texto, subido_por:uuid')],
    implicitFor: [],
    implicitReason: '',
  },
  {
    id: 'calendario',
    modulo: m('Calendario', 'Vista temporal de vencimientos y eventos.', ['Vista mensual y semanal', 'Eventos y vencimientos por responsable'], ['calendario', 'agenda', 'vencimiento', 'evento']),
    entidades: [],
    implicitFor: [],
    implicitReason: '',
  },
  {
    id: 'auditoria',
    modulo: m('Auditoría y trazabilidad', 'Registro de quién hizo qué y cuándo.', ['Historial de cambios por registro', 'Registro de accesos y acciones sensibles'], ['auditoria', 'trazabilidad', 'historial de cambios', 'registro de cambios', 'bitacora']),
    entidades: [e('RegistroAuditoria', 'Traza de una acción.', 'accion:texto, entidad:texto, entidad_id:uuid, cambios:json, usuario_id:uuid')],
    implicitFor: [],
    implicitReason: '',
  },
  {
    id: 'multiempresa',
    modulo: m('Múltiples organizaciones o sucursales', 'Separación de datos por organización, sucursal o unidad.', ['Datos aislados por organización', 'Usuarios asignados a una o varias organizaciones', 'Vista consolidada para dirección'], ['multiempresa', 'multi-empresa', 'multi-tenant', 'multitenant', 'sucursal', 'varias empresas', 'filial']),
    entidades: [e('Organizacion', 'Unidad que agrupa usuarios y datos.', 'nombre:texto, identificador:texto, activa:booleano')],
    implicitFor: [],
    implicitReason: '',
  },
  {
    id: 'importacion',
    modulo: m('Importación de datos', 'Carga masiva desde planillas existentes.', ['Importación desde Excel y CSV con vista previa', 'Validación y reporte de errores por fila'], ['importar', 'importacion', 'migrar', 'migracion', 'carga masiva', 'planilla', 'desde excel']),
    entidades: [],
    implicitFor: [],
    implicitReason: '',
  },
];

// ---------- Integraciones y tecnologías reconocidas ----------

export const INTEGRATION_SIGNALS: { nombre: string; proposito: string; claves: string[] }[] = [
  { nombre: 'Servicio de email transaccional', proposito: 'Envío de avisos, confirmaciones y recuperación de contraseña.', claves: ['email', 'correo', 'mail\\b'] },
  { nombre: 'Pasarela de pagos', proposito: 'Cobro en línea y conciliación de transacciones.', claves: ['pago en linea', 'pago online', 'pasarela', 'tarjeta', 'stripe', 'mercado pago', 'paypal', 'bancard', 'checkout'] },
  { nombre: 'WhatsApp Business', proposito: 'Avisos y recordatorios por mensajería.', claves: ['whatsapp'] },
  { nombre: 'Google Sheets / Excel', proposito: 'Intercambio de datos con planillas existentes.', claves: ['google sheets', 'excel', 'planilla'] },
  { nombre: 'Google Calendar', proposito: 'Sincronización de eventos y turnos.', claves: ['google calendar', 'calendario de google'] },
  { nombre: 'Slack', proposito: 'Notificaciones al equipo.', claves: ['slack'] },
  { nombre: 'Almacenamiento de archivos', proposito: 'Guardado seguro de documentos e imágenes.', claves: ['adjunt', 'subir archivo', 'imagen', 'foto', 'video'] },
  { nombre: 'Mapas y geolocalización', proposito: 'Direcciones, ubicaciones y recorridos.', claves: ['mapa', 'geolocalizacion', 'ubicacion', 'gps\\b'] },
  { nombre: 'Facturación electrónica', proposito: 'Emisión de comprobantes válidos ante la autoridad tributaria.', claves: ['facturacion electronica', 'factura electronica', 'sifen', 'afip', 'sat\\b'] },
];

export const TECH_PREFS: { claves: string[]; capa: string; tecnologia: string }[] = [
  { claves: ['next'], capa: 'Frontend', tecnologia: 'Next.js con React y TypeScript' },
  { claves: ['vue', 'nuxt'], capa: 'Frontend', tecnologia: 'Vue con Nuxt y TypeScript' },
  { claves: ['angular'], capa: 'Frontend', tecnologia: 'Angular' },
  { claves: ['svelte'], capa: 'Frontend', tecnologia: 'SvelteKit' },
  { claves: ['django'], capa: 'Backend', tecnologia: 'Python con Django' },
  { claves: ['fastapi'], capa: 'Backend', tecnologia: 'Python con FastAPI' },
  { claves: ['flask'], capa: 'Backend', tecnologia: 'Python con Flask' },
  { claves: ['laravel', 'php'], capa: 'Backend', tecnologia: 'PHP con Laravel' },
  { claves: ['\\.net', 'c#', 'dotnet'], capa: 'Backend', tecnologia: '.NET' },
  { claves: ['spring', 'java\\b'], capa: 'Backend', tecnologia: 'Java con Spring Boot' },
  { claves: ['nest'], capa: 'Backend', tecnologia: 'Node.js con NestJS' },
  { claves: ['express', 'node'], capa: 'Backend', tecnologia: 'Node.js con TypeScript' },
  { claves: ['postgres'], capa: 'Base de datos', tecnologia: 'PostgreSQL' },
  { claves: ['mysql', 'mariadb'], capa: 'Base de datos', tecnologia: 'MySQL' },
  { claves: ['sql server', 'mssql'], capa: 'Base de datos', tecnologia: 'SQL Server' },
  { claves: ['sqlite'], capa: 'Base de datos', tecnologia: 'SQLite' },
  { claves: ['mongo'], capa: 'Base de datos', tecnologia: 'MongoDB' },
  { claves: ['supabase'], capa: 'Base de datos', tecnologia: 'Supabase (PostgreSQL administrado)' },
  { claves: ['firebase', 'firestore'], capa: 'Base de datos', tecnologia: 'Firebase / Firestore' },
  { claves: ['bootstrap'], capa: 'Estilos', tecnologia: 'Bootstrap' },
  { claves: ['material', 'mui\\b'], capa: 'Estilos', tecnologia: 'Material UI' },
];
