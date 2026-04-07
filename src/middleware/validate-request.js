function validateRequest(validator) {
  return function runValidation(req, _res, next) {
    try {
      validator(req);
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { validateRequest };
