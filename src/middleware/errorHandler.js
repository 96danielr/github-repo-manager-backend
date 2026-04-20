/**
 * Centralized Error Handler
 * Handles error types, prepares response, and executes external monitoring hooks.
 */

const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errorData = null;

  // 1. Mongoose / DB Errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    errorData = Object.values(err.errors).map((e) => e.message);
    message = 'Validation Error';
  }

  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue)[0];
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} ya existe en el sistema`;
  }

  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Formato de ID inválido';
  }

  // 2. Auth Errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Token inválido o expirado';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'La sesión ha expirado, por favor ingresa de nuevo';
  }

  // 3. Centralized Logging & External Monitoring Hook
  const logDetails = {
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    statusCode,
    message: err.message,
    ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
  };

  // LOG TO CONSOLE (Always)
  if (process.env.NODE_ENV === 'development') {
    console.error('❌ [ERROR LOG]:', logDetails);
  } else {
    // In production, you would send this to Sentry, Logtail, etc.
    // example: externalMonitor.captureException(err, { extra: logDetails });
    console.error(`❌ [${logDetails.timestamp}] ${req.method} ${req.path} - ${statusCode}: ${message}`);
  }

  // 4. Send Response
  res.status(statusCode).json({
    success: false,
    message: statusCode === 500 && process.env.NODE_ENV === 'production' 
      ? 'Ha ocurrido un error interno en el servidor' 
      : message,
    ...(errorData && { errors: errorData }),
    meta: {
      timestamp: logDetails.timestamp,
      requestId: req.headers['x-request-id'] || undefined
    }
  });
};

export default errorHandler;
