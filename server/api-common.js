// server/api-common.js: the error a route throws to answer with a C3 error body (C3 4, C10 8.1).
class HttpError extends Error {
  constructor(status, error, details = []) {
    super(error);
    this.name = 'HttpError';
    this.status = status;
    this.error = error;
    this.details = details;
  }
}
module.exports = { HttpError };

