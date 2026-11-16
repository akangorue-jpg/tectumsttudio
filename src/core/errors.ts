/** Error de aplicación con código estable, estado HTTP y mensaje apto para mostrar al usuario. */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const errors = {
  validation: (message: string, details?: unknown) => new AppError('validacion', 400, message, details),
  unauthenticated: () => new AppError('no_autenticado', 401, 'Iniciá sesión para continuar.'),
  forbidden: (message = 'No tenés permiso para realizar esta acción.') => new AppError('prohibido', 403, message),
  notFound: (what = 'El recurso') => new AppError('no_encontrado', 404, `${what} no existe o no tenés acceso.`),
  conflict: (message: string) => new AppError('conflicto', 409, message),
  tooLarge: (message: string) => new AppError('demasiado_grande', 413, message),
  rateLimited: () => new AppError('limite_excedido', 429, 'Demasiados intentos. Esperá un momento y volvé a probar.'),
  unavailable: (message: string) => new AppError('no_disponible', 503, message),
};
