export class AppError extends Error {
    statusCode;
    code;
    details;
    constructor(message, statusCode = 400, code = 'BAD_REQUEST', details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        Object.setPrototypeOf(this, AppError.prototype);
    }
}
export const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const code = err.code || 'INTERNAL_SERVER_ERROR';
    const message = err.message || 'An unexpected error occurred';
    if (process.env.NODE_ENV === 'development' && statusCode === 500) {
        console.error('Unhandled Server Error:', err);
    }
    res.status(statusCode).json({
        success: false,
        message,
        code,
        ...(err.details ? { details: err.details } : {}),
    });
};
