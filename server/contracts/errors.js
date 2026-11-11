// The errors the business code throws. Only the http layer turns them into status codes (httpStatusFor), in one place.

class AppError extends Error {
    constructor(message, code) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
    }
}

/** The caller sent something unusable (a missing field, a name that is not allowed). */
class ValidationError extends AppError {
    constructor(message) { super(message, 'VALIDATION'); }
}

/** Something that should exist does not (a task, a file). */
class NotFoundError extends AppError {
    constructor(message) { super(message, 'NOT_FOUND'); }
}

/** The model could not be reached or did not answer in time. */
class ModelUnavailableError extends AppError {
    constructor(message) { super(message, 'MODEL_UNAVAILABLE'); }
}

/** The model answered, but not with something the server can use. */
class ModelOutputError extends AppError {
    constructor(message) { super(message, 'MODEL_OUTPUT'); }
}

// Model problems stay a 500 so that the answers clients get today do not change.
const httpStatusFor = (error) => {
    if (error instanceof ValidationError) return 400;
    if (error instanceof NotFoundError) return 404;
    return 500;
};

module.exports = { AppError, ValidationError, NotFoundError, ModelUnavailableError, ModelOutputError, httpStatusFor };
