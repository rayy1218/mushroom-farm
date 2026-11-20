// A refused request: its status, the words and the input it is about (the API replies { error, field }). An ask (Data
// integrity, server/asks.js) is one too, carrying its asks.

export class HttpError extends Error {
  constructor(status, message, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}
